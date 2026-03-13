# summary

Insert mock SObject records.

# examples

- Insert 10000 mock Account records:

  <%= config.bin %> <%= command.id %> --target-org myOrg -o Account -c 10000

- Insert with custom batch size:

  <%= config.bin %> <%= command.id %> --target-org myOrg --object Account --count 10000 --batch 5000

# flags.object.summary

Object API Name.

# flags.count.summary

Number of records to insert.

# flags.batch.summary

Local batch size.
