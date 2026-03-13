# summary

Update the stored git hash in a Custom Setting for delta package creation.

# examples

- Update hash from HEAD:
  <%= config.bin %> <%= command.id %> --target-org myOrg@example.com -c DevOpsSettings__c -v DeployKey

- Update with custom hash:
  <%= config.bin %> <%= command.id %> --target-org myOrg@example.com --customsettingobject DevOpsSettings__c --gitcheckkeycustom DeployKey --customhash 0603ab92ff7cf9adf7ca10228807f6bb6b57a894

# flags.gitcheckkeycustom.summary

Custom Setting record name.

# flags.customsettingobject.summary

Custom Setting API name.

# flags.valuecolumn.summary

Custom value column name (optional).

# flags.customhash.summary

Custom hash to update (optional, defaults to HEAD).
