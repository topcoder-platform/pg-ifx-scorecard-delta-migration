SET search_path TO tcs_catalog;

CREATE OR REPLACE FUNCTION "tcs_catalog"."notify_trigger" ()  RETURNS trigger
  VOLATILE
AS $body$
DECLARE
  rec RECORD;
  payload TEXT;
  column_name TEXT;
  column_value TEXT;
  payload_items TEXT[];
  uniquecolumn TEXT;
BEGIN
  -- Set record row depending on operation
  CASE TG_OP
  WHEN 'INSERT', 'UPDATE' THEN
     rec := NEW;
  WHEN 'DELETE' THEN
     rec := OLD;
  ELSE
     RAISE EXCEPTION 'Unknown TG_OP: "%". Should not occur!', TG_OP;
  END CASE;
  
  -- Get required fields
  FOREACH column_name IN ARRAY TG_ARGV LOOP
    EXECUTE format('SELECT $1.%I::TEXT', column_name)
    INTO column_value
    USING rec;
    payload_items := array_append(payload_items, '"' || replace(column_name, '"', '\"') || '":"' || replace(column_value, '"', '\"') || '"');
  END LOOP;
  
  uniquecolumn := (SELECT c.column_name
        FROM information_schema.key_column_usage AS c
        LEFT JOIN information_schema.table_constraints AS t
        ON t.constraint_name = c.constraint_name
        WHERE t.table_name = TG_TABLE_NAME AND t.constraint_type = 'PRIMARY KEY');

  -- Build the payload
  payload := ''
              || '{'
              || '"topic":"' || 'db.postgres.sync' || '",'
              || '"originator":"' || 'tc-postgres-delta-processor' || '",'
              || '"timestamp":"' || CURRENT_TIMESTAMP                    || '",'
              || '"Uniquecolumn":"' || uniquecolumn                   || '",'
              || '"operation":"' || TG_OP                                || '",'
              || '"schema":"'    || TG_TABLE_SCHEMA                      || '",'
              || '"table":"'     || TG_TABLE_NAME                        || '",'
              || '"data":{'      || array_to_string(payload_items, ',')  || '}'
              || '}';

  -- Notify the channel
  PERFORM pg_notify('db_notifications', payload);
  
  RETURN rec;
END;
$body$ LANGUAGE plpgsql;


CREATE TRIGGER "scorecard_trigger"
  AFTER INSERT OR DELETE OR UPDATE ON scorecard
  FOR EACH ROW
EXECUTE PROCEDURE notify_trigger('scorecard_id', 'scorecard_status_id', 'scorecard_type_id', 'project_category_id', 'name', 'version', 'min_score', 'max_score', 'create_user', 'create_date', 'modify_user', 'modify_date', 'version_number');
