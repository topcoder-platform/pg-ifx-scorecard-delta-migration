/**
 * Listens to DML trigger notifications from postgres and pushes the trigger data into kafka
 */
const config = require('config')
const pg = require('pg')
const Kafka = require('no-kafka')
const logger = require('./common/logger')

const pgOptions = config.get('POSTGRES')
const pgConnectionString = `postgresql://${pgOptions.user}:${pgOptions.password}@${pgOptions.host}:${pgOptions.port}/${pgOptions.database}`
const pgClient = new pg.Client(pgConnectionString)

const kafkaOptions = config.get('KAFKA')
const isSslEnabled = kafkaOptions.SSL && kafkaOptions.SSL.cert && kafkaOptions.SSL.key
const producer = new Kafka.Producer({
  connectionString: kafkaOptions.brokers_url,
  ...(isSslEnabled && { // Include ssl options if present
    ssl: {
      cert: kafkaOptions.SSL.cert,
      key: kafkaOptions.SSL.key
    }
  })
})

const terminate = () => process.exit()

/**
 * Pushes a given payload into kafka
 * @param {Object} payload The payload to push into kafka
 */
async function pushToKafka (payload) {
  try {
    await producer.send({
      topic: payload.topic,
      partition: kafkaOptions.partition,
      message: {
        value: JSON.stringify(payload)
      }
    })
    logger.debug('Pushed message to kafka:')
    logger.debug(payload)
  } catch (err) {
    logger.error('Could not push message to kafka:')
    logger.error(payload)
    logger.logFullError(err)
  }
}

/**
 * Initialize kafka producer
 */
async function setupKafkaProducer () {
  try {
    await producer.init()
    logger.info('Initialized kafka producer')
  } catch (err) {
    logger.error('Could not setup kafka producer')
    logger.logFullError(err)
    terminate()
  }
}

/**
 * Initialize postgres client and notification listener
 */
async function setupPgClient () {
  try {
    await pgClient.connect()
    // Listen to each of the trigger functions
    for (const triggerFunction of pgOptions.triggerFunctions) {
      await pgClient.query(`LISTEN ${triggerFunction}`)
    }
    pgClient.on('notification', async (message) => {
      console.log('Received trigger payload:')
      logger.debug(`Received trigger payload:`)
      logger.debug(message)
      console.log(message)
      try {
        const payload = JSON.parse(message.payload)
        const validTopicAndOriginator = (pgOptions.triggerTopics.includes(payload.topic)) && (pgOptions.triggerOriginators.includes(payload.originator)) // Check if valid topic and originator
        if (validTopicAndOriginator) {
          await pushToKafka(payload)
        } else {
          logger.debug('Ignoring message with incorrect topic or originator')
        }
      } catch (err) {
        logger.error('Could not parse message payload')
        logger.logFullError(err)
      }
    })
    logger.info('Listening to notifications')
  } catch (err) {
    logger.error('Could not setup postgres client')
    logger.logFullError(err)
    terminate()
  }
}

/**
 * Initialize pg client and kafka producer
 */
async function run () {
  await setupPgClient()
  await setupKafkaProducer()
}

run()
