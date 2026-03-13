# summary

Mass update a field with a given value.

# examples

- Update IsActive on all Product2 records:

  <%= config.bin %> <%= command.id %> --target-org myOrg -o Product2 -f IsActive -v true

- Update with WHERE clause:

  <%= config.bin %> <%= command.id %> --target-org myOrg --object Product2 --field IsActive --value false --where "ProductCode LIKE 'VLO%'"

# flags.object.summary

API Name of the Object.

# flags.field.summary

API Name of the field to update.

# flags.value.summary

Value to update.

# flags.where.summary

WHERE clause to only update certain records.
