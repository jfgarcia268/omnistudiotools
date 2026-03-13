# summary

Delete Calculation Matrix rows and prepare version for deletion.

# examples

- Delete a calculation matrix version:

  <%= config.bin %> <%= command.id %> --target-org myOrg@example.com -i a0dR000000kxD4qIAE -p ins

- With hard delete:

  <%= config.bin %> <%= command.id %> --target-org myOrg@example.com --matrixid a0dR000000kxD4qIAE --package cmt --hard

# flags.matrixid.summary

Calculation Matrix Version ID to delete.

# flags.package.summary

Vlocity Package Type (ins, cmt, or omnistudio).

# flags.hard.summary

Use hard delete.
