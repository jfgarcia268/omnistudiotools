# summary

Delete old versions of Templates and keep X most recent versions.

# examples

- Keep 5 most recent versions:

  <%= config.bin %> <%= command.id %> --target-org myOrg@example.com -n 5 -p cmt

- Keep 3 versions with ins package:

  <%= config.bin %> <%= command.id %> --target-org myOrg@example.com --numberversions 3 --package ins

# flags.numberversions.summary

Number of most recent versions to keep.

# flags.package.summary

Vlocity Package Type (ins or cmt).
