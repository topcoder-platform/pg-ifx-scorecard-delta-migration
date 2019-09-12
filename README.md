# Delta Migration from Postgres to Informix

## Prerequisites
1. Node.js >= v10.14.2
2. Earlier challenge Details: https://github.com/topcoder-platform/informix-postgres-migrator/tree/master/pg_delta_folder

## Setup
There are 4 main components to setup. You can follow the instructions for each component to set them up.

### Postgres setup
1. Download and install postgres if you don't have it already. You can check the [download page](https://www.postgresql.org/download/) and get the one for your OS.


4. Modify [01_tcs_catalog_main_schema.sql](https://github.com/topcoder-platform/informix-postgres-migrator/blob/master/tc-database-scripts/tcs_catalog/01_tcs_catalog_main_schema.sql) in `informix-postgres-migrator/tc-database-scripts/tcs_catalog` to fit your username.
Change the first few lines to,
```
  -- Create schema (database)
  CREATE schema tcs_catalog authorization <your_username>;

  SET search_path TO tcs_catalog;
  -- Grant access
  GRANT USAGE ON SCHEMA tcs_catalog TO <your_username> ;

  -- User public does not have connect privilege;
  CREATE TABLE IF NOT EXISTS tcs_catalog.company_size (
    .
    .
    .
```

5. Execute all [three sql scripts](https://github.com/topcoder-platform/informix-postgres-migrator/tree/master/tc-database-scripts/tcs_catalog) in order, one after another.
On Mac, execute using command,
`postgres=# \i <path_to_sql_file>`

6. Execute the [trigger setup sql](https://github.com/topcoder-platform/informix-postgres-migrator/blob/master/pg_delta_folder/scorecard_example_trigger_function.sql) in `informix-postgres-migrator/pg_delta_folder`

7. (Optional) Use a tool like [pgAdmin](https://www.pgadmin.org/download/) to view tables and data

### Kafka setup

Instructions below provide details to setup Kafka server in Mac, Windows will use bat commands in bin/windows instead

1. Download and install [kafka](http://kafka.apache.org/downloads)

2. Extract downloaded file and go into it

3. Start ZooKeeper server, `bin/zookeeper-server-start.sh config/zookeeper.properties`

4. Use another terminal, go to the same directory and start the Kafka server, `bin/kafka-server-start.sh config/server.properties`

5. Use another terminal, go to the same directory and create a topic. The topic name is the same name that is defined in the trigger sql. It needs to be set in `config/default.js` -> `KAFKA` `topic`. 
According to given sample [payload](https://github.com/topcoder-platform/informix-postgres-migrator/blob/master/pg_delta_folder/pg_sample_payload.json) it is, `db.postgres.sync`. So, create topic using,
`bin/kafka-topics.sh --create --zookeeper localhost:2181 --replication-factor 1 --partitions 1 --topic db.postgres.sync`

6. Verify that the topics are created using `bin/kafka-topics.sh --list --zookeeper localhost:2181`. It should list out the created topic.

### Informix docker setup

1. [Download](https://www.docker.com/products/docker-desktop) and install docker if you don't have it already.

2. Setup informix by running `docker run -p 2021:2021 -it appiriodevops/informix:6f3884d`

3. (Optional) Use a tool like [RazorSQL](https://razorsql.com/download.html) to view data in informix. Use `INFORMIX` config options in `config/default.js` to create a new connection.

### Start node server

1. Modify `POSTGRES`, `user` and `password` in `config/default.js` and `config/test.js` to match your username and password. The other options will remain same unless you have a different environment and explicitly modify something like changing default ports for services.
Also, note that the SSL options for kafka are optional. You can leave them set to null.

2. In the current directory, run `npm i` to install modules.

3. Start producer and consumer using `npm start`.

## Verification

You can verify by executing insert/update/delete commands in postgres terminal and check that the informix database is updated.

Some sample commands to execute,
**Insert** : `INSERT INTO tcs_catalog.scorecard(scorecard_id,scorecard_status_id,scorecard_type_id,project_category_id,name,version,min_score,max_score,create_user,create_date,modify_user,modify_date) VALUES (1, 1, 1, 1, 'Default design scorecard', '1.0', 75.0, 100.0, '132456', '2008-11-27 14:14:29.517', '132456', '2008-11-27 14:14:29.517');`

**Update**: `update tcs_catalog.scorecard set name='new name' where scorecard_id=1;`

**Delete**: `delete from tcs_catalog.scorecard where scorecard_id=1;`

If you want to test other tables, you need to create a trigger first. To test country_codes for instance, run
```
SET search_path TO tcs_catalog;
CREATE TRIGGER "country_codes_trigger"
  AFTER INSERT OR DELETE OR UPDATE ON country_codes
  FOR EACH ROW
  EXECUTE PROCEDURE public.notify_trigger('country_code', 'description');
```

## Tests

1. Make sure you have all 4 components from above, setup and running.

2. Open a new terminal and execute `npm test`

3. You will see tests running. It will take some time as there is a 5s delay to wait for postgres updates to be propagated to informix. You can change this value in `config/test.js` -> `TEST_INTERVAL` if you want.

## Lint

1. Run `npm run lint` to view lint errors

2. Run `npm run lint:fix` to fix lint errors

## Other commands

1. Run `npm run producer` to only execute the producer

2. Run `npm run consumer` to only execute the consumer

## Npm vulnerabilities

Npm lists 1 vulnerability. Using `npm audit` does not fix this. The problem is that `no-kafka` uses a vulnerable version of `lodash`. This can only be fixed when `no-kafka` updates its `package.json` to use a newer version of `lodash`. 
So it is beyond our control.

## Other notes

1. There was no need to handle data type conversions. It is automatically handled by the informix database.

2. You might see trace messages posted from dependency module `informix-wrapper` such as
```
Trace: Initializing for url jdbc:informix-sqli://localhost:2021/tcs_catalog:INFORMIXSERVER=informixoltp_tcp;INFORMIXCONRETRY=1;INFORMIXCONTIME=30;
    at JDBCConn.initialize (/Users/Desktop/postgres_informix_updater/node_modules/informix-wrapper/lib/jdbc-wrapper.js:85:21)
    at createConnection (/Users/Desktop/postgres_informix_updater/src/common/informixWrapper.js:31:15)
    at Promise (/Users/Desktop/postgres_informix_updater/src/common/informixWrapper.js:44:24)
Desktop/postgres_informix_updater/node_modules/bluebird/js/release/util.js:16:23)
    at Object.handler (/Users/m
```
These are not errors. Just logs.

