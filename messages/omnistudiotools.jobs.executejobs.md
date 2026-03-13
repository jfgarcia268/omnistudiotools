# summary

Run CMT admin jobs from a YAML file.

# examples

- Run jobs with 20 second poll time:

  <%= config.bin %> <%= command.id %> --target-org myOrg@example.com -j jobs.yaml -p 20

- Run with stop on error:

  <%= config.bin %> <%= command.id %> --target-org myOrg@example.com --jobs jobs.yaml --pooltime 30 --stoponerror

# flags.jobs.summary

YAML job file path.

# flags.pooltime.summary

Poll time in seconds (default 10).

# flags.stoponerror.summary

Stop execution on error.

# flags.more.summary

Enable verbose logs.

# flags.remoteapex.summary

Use remote Apex execution.

# flags.package.summary

Vlocity Package Type (ins, cmt, or omnistudio).
