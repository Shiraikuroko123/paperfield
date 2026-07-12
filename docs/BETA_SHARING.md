# Private Beta Sharing

Paperfield can expose a temporary HTTPS address through ngrok without purchasing a domain. Only the host computer needs ngrok; testers open the HTTPS address in an ordinary browser and install nothing. The shared instance is separate from the personal instance at `http://127.0.0.1:8765`.

## Isolation

The beta profile lives under the ignored path:

```text
local/data/profiles/beta/
```

On first preparation, Paperfield copies the public paper and GitHub project catalog, then removes:

- Reading status, favorites, notes, and explanations.
- Paper and project chats.
- Personal local/cloud PDF records.
- Downloaded project source and project explanations.
- Personal R2 inventory and usage records.

The beta process uses the same private R2 bucket through the isolated `community-beta/` object prefix. It cannot overwrite personal PDFs, explanations, chats, or translations. Papers added through the connector and PDFs stored in this namespace are visible to every account in the beta workspace.

The shared namespace defaults to a 2 GB capacity ceiling. A beta account can change the local limit under **存储与用量 → 共享库容量上限**. Paperfield rejects new uploads before the configured ceiling is exceeded. This local ceiling is separate from Cloudflare's billing limit.

Manual PDF uploads require the uploader to confirm they have the right to share the file. Do not redistribute subscription-only or institution-licensed publisher copies. Connector-resolved legal open-access PDFs can enter the shared namespace automatically.

The beta process can use the host computer's current CC Switch/OpenAI-compatible configuration for AI explanations. Requests therefore consume the host account's model quota.

## Accounts

Paperfield allows at most four shared-instance accounts. The ignored registry is:

```text
local/data/profiles/beta/auth-users.json
```

The registry stores PBKDF2 password hashes and random salts, never plaintext passwords.

```powershell
# List accounts
python scripts/manage-beta-users.py list

# Add a beta account that may use the host's configured GPT provider
python scripts/manage-beta-users.py add friend-name --role beta

# Add a standard account that cannot consume the host's GPT quota
python scripts/manage-beta-users.py add friend-name --role standard

# Reset a password
python scripts/manage-beta-users.py reset friend-name

# Temporarily disable or re-enable access
python scripts/manage-beta-users.py disable friend-name
python scripts/manage-beta-users.py enable friend-name
```

Use a unique password of at least 12 characters before sharing the tunnel address outside a direct private conversation.

Account roles:

- `beta`: may use the host computer's configured CC Switch/OpenAI-compatible provider.
- `standard`: can use discovery, PDFs, translation, code reading, and other non-GPT features, but the shared server rejects GPT explanation/chat requests.

A standard account cannot directly reach an API bound to `127.0.0.1` on the tester's computer through this tunnel: localhost belongs to the tester's machine, while Paperfield runs on the host machine. To use a personal local API, the standard user must run their own Paperfield copy locally and connect that copy to CC Switch or another OpenAI-compatible endpoint.

## Configure ngrok once

Create a free ngrok account, copy the Authtoken from its dashboard, and configure it locally. Do not paste the token into chat or commit it to Git:

```powershell
ngrok config add-authtoken <TOKEN>
```

This is a one-time setup on the host computer. Testers do not need an ngrok account or application.

Free ngrok accounts currently require agent version `3.20.0` or newer. Run `ngrok update` if startup reports `ERR_NGROK_121`.

## Start Sharing

For one-click background sharing on Windows, install the desktop shortcuts once:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-beta-shortcuts.ps1
```

Double-click **Paperfield Share** to start the protected service in a hidden background process. Paperfield copies the current HTTPS address to the clipboard and opens it in the default browser. Double-click **Stop Paperfield Share** when sharing is finished. No PowerShell window needs to remain visible, and sharing does not start automatically with Windows unless the optional task below is installed.

## Start automatically with Windows

To keep the protected share available after every Windows sign-in, register the current-user scheduled task once:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-beta-autostart.ps1
```

The task runs invisibly, starts immediately, and retries when ngrok exits unexpectedly. Windows shutdown ends the process naturally. **Stop Paperfield Share** stops the current session; the scheduled task starts again at the next sign-in.

Disable and remove automatic startup with:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-beta-autostart.ps1 -Disable
```

For a link that remains unchanged after restarts, reserve a domain in the [ngrok dashboard](https://dashboard.ngrok.com/domains), then add it to the ignored `local/.env` file:

```env
PAPERFIELD_NGROK_URL=https://your-name.ngrok-free.app
```

Do not set a random temporary ngrok URL here; `--url` only works for a domain assigned to the current ngrok account.

The command-line workflow remains available for troubleshooting. Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-beta-ngrok.ps1
```

The script starts the protected beta instance on local port `8876`, then prints an address similar to:

```text
https://example-name.ngrok-free.app
```

Send the HTTPS address and account credentials to the tester through separate private messages. Keep the PowerShell window open while the tester is using Paperfield. The temporary address may change after the tunnel restarts.

Press `Ctrl+C` in the sharing window to stop the tunnel and beta server. If the server remains after an interrupted terminal session, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\stop-beta-share.ps1
```

## Limits

- The host computer must remain online.
- The free ngrok address may change after the tunnel restarts.
- The login page protects application access, but the link should still be shared privately.
- All beta accounts share the beta reading history.
- Model requests use the host's configured provider and quota.
- Shared R2 objects use the `community-beta/` prefix and count toward the owner's R2 quota.
