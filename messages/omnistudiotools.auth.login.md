# summary

Login using username + password and token.

# examples

- Login with username and password:

  <%= config.bin %> <%= command.id %> -u jgonzalez@vlocity.com -p 'pass123' -t eXUTtoken -a dev1

- Login with custom URL:

  <%= config.bin %> <%= command.id %> --username jgonzalez@vlocity.com --password 'pass123' --token eXUTtoken --url 'https://test.salesforce.com' --alias dev1

# flags.username.summary

Username for authentication.

# flags.password.summary

Password for authentication.

# flags.token.summary

Security token (optional).

# flags.url.summary

Org URL (default: https://login.salesforce.com).

# flags.alias.summary

Alias for the new connection.
