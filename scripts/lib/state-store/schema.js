'use strict';

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');

const SCHEMA_PATH = path.join(__dirname, '..', '..', '..', 'schemas', 'state-store.schema.json');

let cachedSchema = null;
let cachedSchemaMtime = 0;
let cachedAjv = null;
let cachedAjvSchemaMtime = 0;
const cachedValidators = new Map();

function readSchema() {
  try {
    const stats = fs.statSync(SCHEMA_PATH);
    const mtime = stats.mtimeMs;

    if (cachedSchema && cachedSchemaMtime === mtime) {
      return cachedSchema;
    }

    // Schema file changed - invalidate Ajv cache too
    cachedSchema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
    cachedSchemaMtime = mtime;
    cachedAjv = null; // Force re-creation with new schema
    cachedValidators.clear(); // Clear compiled validators
    return cachedSchema;
  } catch (error) {
    if (cachedSchema) {
      console.warn(`Schema read failed, using cached version: ${error.message}`);
      return cachedSchema;
    }
    throw error;
  }
}

function getAjv() {
  if (cachedAjv) {
    return cachedAjv;
  }

  cachedAjv = new Ajv({
    allErrors: true,
    strict: false,
  });
  return cachedAjv;
}

function getEntityValidator(entityName) {
  if (cachedValidators.has(entityName)) {
    return cachedValidators.get(entityName);
  }

  const schema = readSchema();
  const definitionName = ENTITY_DEFINITIONS[entityName];

  if (!definitionName || !schema.$defs || !schema.$defs[definitionName]) {
    throw new Error(`Unknown state-store schema entity: ${entityName}`);
  }

  const validatorSchema = {
    $schema: schema.$schema,
    ...schema.$defs[definitionName],
    $defs: schema.$defs,
  };
  const validator = getAjv().compile(validatorSchema);
  cachedValidators.set(entityName, validator);
  return validator;
}

function formatValidationErrors(errors = []) {
  return errors
    .map(error => `${error.instancePath || '/'} ${error.message}`)
    .join('; ');
}

function validateEntity(entityName, payload) {
  const validator = getEntityValidator(entityName);
  const valid = validator(payload);
  return {
    valid,
    errors: validator.errors || [],
  };
}

function assertValidEntity(entityName, payload, label) {
  const result = validateEntity(entityName, payload);
  if (!result.valid) {
    throw new Error(`Invalid ${entityName}${label ? ` (${label})` : ''}: ${formatValidationErrors(result.errors)}`);
  }
}

module.exports = {
  assertValidEntity,
  formatValidationErrors,
  readSchema,
  validateEntity,
};
