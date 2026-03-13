# summary

Delete SObjects from a YAML data file.

# examples

- Delete objects using a YAML file:

  <%= config.bin %> <%= command.id %> --target-org myOrg@example.com -p ins -d objects.yaml

- Delete with hard delete and save results:

  <%= config.bin %> <%= command.id %> --target-org myOrg@example.com --package cmt --datafile objects.yaml --hard --save

- Query only mode (no deletes):

  <%= config.bin %> <%= command.id %> --target-org myOrg@example.com -p ins -d objects.yaml --onlyquery

- Big batch mode with custom size:

  <%= config.bin %> <%= command.id %> --target-org myOrg@example.com -p cmt -d objects.yaml --big --bigsize 100000

# flags.package.summary

Vlocity Package Type (ins, cmt, or omnistudio).

# flags.datafile.summary

Path to YAML file with objects to delete.

# flags.onlyquery.summary

Only query records, do not delete.

# flags.retry.summary

Retry deleting if errors occur.

# flags.save.summary

Save delete results to file.

# flags.hard.summary

Use hard delete.

# flags.polltimeout.summary

Bulk API poll timeout in minutes.

# flags.big.summary

Use big batch mode for large datasets.

# flags.bigsize.summary

Number of records per big batch (default: 500000).
