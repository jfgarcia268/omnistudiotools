# summary

Delete old DataPacks used by Vlocity Build Tool.

# examples

- Delete datapacks with cmt package:

  <%= config.bin %> <%= command.id %> --target-org myOrg@example.com -p cmt

- Delete datapacks with ins package:

  <%= config.bin %> <%= command.id %> --target-org myOrg@example.com --package ins

# flags.package.summary

Vlocity Package Type (ins or cmt).
