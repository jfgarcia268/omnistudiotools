# summary

Create JSON to bulk update a Copado User Story from package.xml or Vlocity manifest.

# examples

- Create manifest from package.xml:

  <%= config.bin %> <%= command.id %> --package package.xml

- Create manifest from Vlocity manifest with username:

  <%= config.bin %> <%= command.id %> --package manifest.yaml --username User123 --vlocity

# flags.package.summary

Package.xml file location.

# flags.username.summary

Username to use.

# flags.vlocity.summary

Is a Vlocity Manifest.
