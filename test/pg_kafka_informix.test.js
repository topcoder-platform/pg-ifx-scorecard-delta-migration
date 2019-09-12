/* eslint-disable no-unused-expressions */
/**
 * Contains tests for updating postgres and validating that the corresponding informix database is updated
 */
process.env.NODE_ENV = 'test'
const config = require('config')
const chai = require('chai')
const pg = require('pg')
const data = require('./testData.json')
const informix = require('../src/common/informixWrapper')

/**
 * Wait for TEST_INTERVAL milliseconds
 */
async function sleep () {
  await new Promise((resolve) => {
    setTimeout(() => {
      resolve()
    }, config.get('TEST_INTERVAL'))
  })
}

describe('End to end tests', function run () {
  this.timeout(5 * config.get('TEST_INTERVAL'))
  const pgOptions = config.get('POSTGRES')
  const pgConnectionString = `postgresql://${pgOptions.user}:${pgOptions.password}@${pgOptions.host}:${pgOptions.port}/${pgOptions.database}`
  const pgClient = new pg.Client(pgConnectionString)

  const testTablePg = `${config.get('TEST_SCHEMA')}.${config.get('TEST_TABLE')}`
  const testTableInformix = `${config.get('TEST_SCHEMA')}:${config.get('TEST_TABLE')}`

  const expect = chai.expect

  // Delete test row if exists
  async function deleteTestRow () {
    const row = data.rowOne
    await pgClient.query(`delete from ${testTablePg} where scorecard_id = ${row.scorecard_id}`)
    await informix.executeQuery(config.get('TEST_SCHEMA'), `delete from ${testTableInformix} where scorecard_id = ${row.scorecard_id}`)
  }

  // Establish postgres connection
  this.beforeAll(async function createTestTable () {
    await pgClient.connect()
  })

  // Delete test row if exists
  this.afterAll(async function removeTestDataIfExists () {
    await deleteTestRow()
  })

  // Delete test row if exists
  this.beforeEach(async function clean () {
    await deleteTestRow()
  })

  it('Inserts a row into Postgres and checks its creation in Informix', async () => {
    const row = data.rowOne
    // Row does not exist in informix table
    const rowInInformixBefore = await informix.executeQuery(config.get('TEST_SCHEMA'), `select * from ${testTableInformix} where scorecard_id = ${row.scorecard_id}`)
    expect(rowInInformixBefore).to.be.an('array').that.is.empty

    // Insert row into postgres
    const sql = `INSERT INTO ${testTablePg}(scorecard_id, scorecard_status_id, scorecard_type_id, project_category_id, name, version, min_score, max_score, create_user, create_date, modify_user, modify_date, version_number) VALUES ('${row.scorecard_id}', '${row.scorecard_status_id}', '${row.scorecard_type_id}', '${row.project_category_id}', '${row.name}', '${row.version}', '${row.min_score}',' ${row.max_score}', '${row.create_user}', '${row.create_date}', '${row.modify_user}', '${row.modify_date}', '${row.version_number}');`
    await pgClient.query(sql)

    // Row will now be created in informix
    await sleep()
    const rowInInformixAfter = await informix.executeQuery(config.get('TEST_SCHEMA'), `select * from ${testTableInformix} where scorecard_id = ${row.scorecard_id};`)
    expect(rowInInformixAfter).to.be.an('array').that.is.not.empty
    expect(rowInInformixAfter).to.deep.equal([row])
  })

  it('Updates a row in Postgres and checks if it is updated in Informix', async () => {
    const row = data.rowOne

    // Insert row into postgres
    const sql = `INSERT INTO ${testTablePg}(scorecard_id, scorecard_status_id, scorecard_type_id, project_category_id, name, version, min_score, max_score, create_user, create_date, modify_user, modify_date, version_number) VALUES ('${row.scorecard_id}', '${row.scorecard_status_id}', '${row.scorecard_type_id}', '${row.project_category_id}', '${row.name}', '${row.version}', '${row.min_score}',' ${row.max_score}', '${row.create_user}', '${row.create_date}', '${row.modify_user}', '${row.modify_date}', '${row.version_number}');`
    await pgClient.query(sql)

    // Check existing "name" in informix
    await sleep()
    const rowInInformixBefore = await informix.executeQuery(config.get('TEST_SCHEMA'), `select * from ${testTableInformix} where scorecard_id = ${row.scorecard_id};`)
    expect(rowInInformixBefore).to.be.an('array').that.is.not.empty
    expect(rowInInformixBefore[0].name).to.equal(row.name) // Has name = Current name

    // Update "name" in postgres
    await pgClient.query(`update ${testTablePg} set name='${data.updatedName}' where scorecard_id = ${row.scorecard_id};`)

    // "name" will now be updated in informix
    await sleep()
    const rowInInformixAfter = await informix.executeQuery(config.get('TEST_SCHEMA'), `select * from ${testTableInformix} where scorecard_id = ${row.scorecard_id};`)
    expect(rowInInformixAfter).to.be.an('array').that.is.not.empty
    expect(rowInInformixAfter[0].name).to.equal(data.updatedName) // Check for updated name. Has name = New name
  })

  it('Deletes a row in Postgres and checks if it is deleted in Informix', async () => {
    const row = data.rowOne

    // Insert row into postgres
    const sql = `INSERT INTO ${testTablePg}(scorecard_id, scorecard_status_id, scorecard_type_id, project_category_id, name, version, min_score, max_score, create_user, create_date, modify_user, modify_date, version_number) VALUES ('${row.scorecard_id}', '${row.scorecard_status_id}', '${row.scorecard_type_id}', '${row.project_category_id}', '${row.name}', '${row.version}', '${row.min_score}',' ${row.max_score}', '${row.create_user}', '${row.create_date}', '${row.modify_user}', '${row.modify_date}', '${row.version_number}');`
    await pgClient.query(sql)

    // Check that row exists in informix
    await sleep()
    const rowInInformixBefore = await informix.executeQuery(config.get('TEST_SCHEMA'), `select * from ${testTableInformix} where scorecard_id = ${row.scorecard_id};`)
    expect(rowInInformixBefore).to.be.an('array').that.is.not.empty
    expect(rowInInformixBefore).to.deep.equal([row])

    // Delete row in postgres
    await pgClient.query(`delete from ${testTablePg} where scorecard_id = ${row.scorecard_id};`)

    // Row will now be deleted in informix
    await sleep()
    const rowInInformixAfter = await informix.executeQuery(config.get('TEST_SCHEMA'), `select * from ${testTableInformix} where scorecard_id = ${row.scorecard_id};`)
    expect(rowInInformixAfter).to.be.an('array').that.is.empty
  })

  it('Inserts two rows and then updates a row in Postgres and checks if right row is updated in Informix', async () => {
    const rowTwo = data.rowTwo
    // Delete row two if exists
    await pgClient.query(`delete from ${testTablePg} where scorecard_id = ${rowTwo.scorecard_id}`)
    await informix.executeQuery(config.get('TEST_SCHEMA'), `delete from ${testTableInformix} where scorecard_id = ${rowTwo.scorecard_id}`)

    const row = data.rowOne

    // Insert row one into postgres
    let sql = `INSERT INTO ${testTablePg}(scorecard_id, scorecard_status_id, scorecard_type_id, project_category_id, name, version, min_score, max_score, create_user, create_date, modify_user, modify_date, version_number) VALUES ('${row.scorecard_id}', '${row.scorecard_status_id}', '${row.scorecard_type_id}', '${row.project_category_id}', '${row.name}', '${row.version}', '${row.min_score}',' ${row.max_score}', '${row.create_user}', '${row.create_date}', '${row.modify_user}', '${row.modify_date}', '${row.version_number}');`
    await pgClient.query(sql)

    // Insert row two into postgres
    sql = `INSERT INTO ${testTablePg}(scorecard_id, scorecard_status_id, scorecard_type_id, project_category_id, name, version, min_score, max_score, create_user, create_date, modify_user, modify_date, version_number) VALUES ('${rowTwo.scorecard_id}', '${rowTwo.scorecard_status_id}', '${rowTwo.scorecard_type_id}', '${rowTwo.project_category_id}', '${rowTwo.name}', '${rowTwo.version}', '${rowTwo.min_score}',' ${rowTwo.max_score}', '${rowTwo.create_user}', '${rowTwo.create_date}', '${rowTwo.modify_user}', '${rowTwo.modify_date}', '${rowTwo.version_number}');`
    await pgClient.query(sql)

    // Check existing "name" in informix for row one
    await sleep()
    const rowInInformixBefore = await informix.executeQuery(config.get('TEST_SCHEMA'), `select * from ${testTableInformix} where scorecard_id = ${row.scorecard_id};`)
    expect(rowInInformixBefore).to.be.an('array').that.is.not.empty
    expect(rowInInformixBefore[0].name).to.equal(row.name) // Has name = Current name

    // Update "name" in postgres for row one
    await pgClient.query(`update ${testTablePg} set name='${data.updatedName}' where scorecard_id = ${row.scorecard_id};`)

    // "name" will now be updated for row one in informix
    await sleep()
    const rowInInformixAfter = await informix.executeQuery(config.get('TEST_SCHEMA'), `select * from ${testTableInformix} where scorecard_id = ${row.scorecard_id};`)
    expect(rowInInformixAfter).to.be.an('array').that.is.not.empty
    expect(rowInInformixAfter[0].name).to.equal(data.updatedName) // Check for updated name. Has name = New name

    // "name" will NOT be updated for row two in informix
    await sleep()
    const rowInInformixAfter2 = await informix.executeQuery(config.get('TEST_SCHEMA'), `select * from ${testTableInformix} where scorecard_id = ${rowTwo.scorecard_id};`)
    expect(rowInInformixAfter2).to.be.an('array').that.is.not.empty
    expect(rowInInformixAfter2[0].name).to.equal(rowTwo.name)

    // Clean up by deleting row two
    await pgClient.query(`delete from ${testTablePg} where scorecard_id = ${rowTwo.scorecard_id}`)
    await informix.executeQuery(config.get('TEST_SCHEMA'), `delete from ${testTableInformix} where scorecard_id = ${rowTwo.scorecard_id}`)
  })

  it('Inserts invalid row into postgres and checks that no row is created in Informix', async () => {
    const row = data.rowOne
    // Row does not exist in informix table
    const rowInInformixBefore = await informix.executeQuery(config.get('TEST_SCHEMA'), `select * from ${testTableInformix} where scorecard_id = ${row.scorecard_id}`)
    expect(rowInInformixBefore).to.be.an('array').that.is.empty

    // Insert invalid row into postgres
    try {
      const sql = `INSERT INTO ${testTablePg}(INVALID, scorecard_status_id, scorecard_type_id, project_category_id, name, version, min_score, max_score, create_user, create_date, modify_user, modify_date, version_number) VALUES ('${row.scorecard_id}', '${row.scorecard_status_id}', '${row.scorecard_type_id}', '${row.project_category_id}', '${row.name}', '${row.version}', '${row.min_score}',' ${row.max_score}', '${row.create_user}', '${row.create_date}', '${row.modify_user}', '${row.modify_date}', '${row.version_number}');`
      await pgClient.query(sql)
    } catch (err) {
      // Ignore error
    }

    // Row will not be created in informix
    await sleep()
    const rowInInformixAfter = await informix.executeQuery(config.get('TEST_SCHEMA'), `select * from ${testTableInformix} where scorecard_id = ${row.scorecard_id};`)
    expect(rowInInformixAfter).to.be.an('array').that.is.empty
  })

  it('Updates invalid row into postgres and checks that no row is updated in Informix', async () => {
    const row = data.rowOne
    // Row does not exist in informix table
    const rowInInformixBefore = await informix.executeQuery(config.get('TEST_SCHEMA'), `select * from ${testTableInformix} where scorecard_id = ${row.scorecard_id}`)
    expect(rowInInformixBefore).to.be.an('array').that.is.empty

    // Insert row into postgres
    const sql = `INSERT INTO ${testTablePg}(scorecard_id, scorecard_status_id, scorecard_type_id, project_category_id, name, version, min_score, max_score, create_user, create_date, modify_user, modify_date, version_number) VALUES ('${row.scorecard_id}', '${row.scorecard_status_id}', '${row.scorecard_type_id}', '${row.project_category_id}', '${row.name}', '${row.version}', '${row.min_score}',' ${row.max_score}', '${row.create_user}', '${row.create_date}', '${row.modify_user}', '${row.modify_date}', '${row.version_number}');`
    await pgClient.query(sql)

    // Row will now be created in informix
    await sleep()
    const rowInInformixDuring = await informix.executeQuery(config.get('TEST_SCHEMA'), `select * from ${testTableInformix} where scorecard_id = ${row.scorecard_id};`)
    expect(rowInInformixDuring).to.be.an('array').that.is.not.empty
    expect(rowInInformixDuring).to.deep.equal([row])

    // Perform invalid update
    try {
      // Update "INVALID" in postgres
      await pgClient.query(`update ${testTablePg} set INVALID='${data.updatedName}' where scorecard_id = ${row.scorecard_id};`)
    } catch (err) {
      // Ignore error
    }

    // Row will not be updated in informix
    await sleep()
    const rowInInformixAfter = await informix.executeQuery(config.get('TEST_SCHEMA'), `select * from ${testTableInformix} where scorecard_id = ${row.scorecard_id};`)
    expect(rowInInformixAfter).to.be.an('array').that.is.not.empty
    expect(rowInInformixAfter).to.deep.equal([row])
  })

  it('Deletes invalid row into postgres and checks that no row is deleted in Informix', async () => {
    const row = data.rowOne
    // Row does not exist in informix table
    const rowInInformixBefore = await informix.executeQuery(config.get('TEST_SCHEMA'), `select * from ${testTableInformix} where scorecard_id = ${row.scorecard_id}`)
    expect(rowInInformixBefore).to.be.an('array').that.is.empty

    // Insert row into postgres
    const sql = `INSERT INTO ${testTablePg}(scorecard_id, scorecard_status_id, scorecard_type_id, project_category_id, name, version, min_score, max_score, create_user, create_date, modify_user, modify_date, version_number) VALUES ('${row.scorecard_id}', '${row.scorecard_status_id}', '${row.scorecard_type_id}', '${row.project_category_id}', '${row.name}', '${row.version}', '${row.min_score}',' ${row.max_score}', '${row.create_user}', '${row.create_date}', '${row.modify_user}', '${row.modify_date}', '${row.version_number}');`
    await pgClient.query(sql)

    // Row will now be created in informix
    await sleep()
    const rowInInformixDuring = await informix.executeQuery(config.get('TEST_SCHEMA'), `select * from ${testTableInformix} where scorecard_id = ${row.scorecard_id};`)
    expect(rowInInformixDuring).to.be.an('array').that.is.not.empty
    expect(rowInInformixDuring).to.deep.equal([row])

    // Perform invalid delete
    try {
      // Delete invalid row in postgres
      await pgClient.query(`delete from ${testTablePg} where INVALID = ${row.scorecard_id};`)
    } catch (err) {
      // Ignore error
    }

    // Row will not be deleted in informix
    await sleep()
    const rowInInformixAfter = await informix.executeQuery(config.get('TEST_SCHEMA'), `select * from ${testTableInformix} where scorecard_id = ${row.scorecard_id};`)
    expect(rowInInformixAfter).to.be.an('array').that.is.not.empty
    expect(rowInInformixAfter).to.deep.equal([row])
  })
})
