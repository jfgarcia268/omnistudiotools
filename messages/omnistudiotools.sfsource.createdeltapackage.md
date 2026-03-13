# summary

Create a delta deployment package based on git diff from a stored hash.

# examples

- Create delta from stored hash:
  <%= config.bin %> <%= command.id %> --target-org myOrg@example.com -p cmt -d force-app

- With custom setting:
  <%= config.bin %> <%= command.id %> --target-org myOrg@example.com --sourcefolder force-app --gitcheckkeycustom VBTDeployKey --customsettingobject DevOpsSettings__c

# flags.package.summary

Vlocity Package Type (ins, cmt, or omnistudio).

# flags.sourcefolder.summary

Source folder to create delta package from.

# flags.gitcheckkey.summary

Key when using gitCheckKey with Build Tool (optional).

# flags.gitcheckkeycustom.summary

Custom Setting record name when using --customsettingobject (optional).

# flags.customsettingobject.summary

Custom Setting API name (optional).

# flags.valuecolumn.summary

Field name where hash is stored when using --customsettingobject (optional).

# flags.more.summary

Enable verbose logging.
