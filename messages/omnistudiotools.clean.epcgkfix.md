# summary

Fix AA and PCI GlobalKey mismatch between two orgs.

# examples

- Fix AA and PCI between source and target:

  <%= config.bin %> <%= command.id %> -s myOrg@example.com -t myOrg2@example.com -p cmt --pci --aa

- Fix only AA with check mode:

  <%= config.bin %> <%= command.id %> --source myOrg@example.com --target myOrg2@example.com --package ins --aa --check

- Fix with custom definitions file:

  <%= config.bin %> <%= command.id %> --source myOrg@example.com --target myOrg2@example.com --package cmt --aa --pci --definitions definitions.yaml

# flags.package.summary

Vlocity Package Type (ins, cmt, or omnistudio).

# flags.source.summary

Source org alias or username.

# flags.target.summary

Target org alias or username.

# flags.pci.summary

Fix Product Child Items GlobalKeys.

# flags.aa.summary

Fix Attribute Assignments GlobalKeys.

# flags.check.summary

Check mode only (no updates).

# flags.definitions.summary

YAML file with custom PCI and AA field definitions.
