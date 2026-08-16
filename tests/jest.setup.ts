// The services log through Powertools. Tests exercise those paths deliberately, so silence the output rather
// than printing a log line for every assertion.
process.env.POWERTOOLS_LOG_LEVEL = "SILENT";
process.env.POWERTOOLS_DEV = "false";
