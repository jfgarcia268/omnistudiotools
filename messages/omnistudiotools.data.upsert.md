# summary

Upsert SObjects from a CSV file.

# examples

- Upsert accounts from CSV:

  <%= config.bin %> <%= command.id %> --target-org myOrg -f accounts.csv -o Account -i Name2__c

- Upsert with save results:

  <%= config.bin %> <%= command.id %> --target-org myOrg --csv accounts.csv --object Account --id Name2__c --save

# flags.csv.summary

CSV file with records to upsert.

# flags.object.summary

Object API Name.

# flags.id.summary

External ID field for upsert.

# flags.save.summary

Save batch results.
