# Private Beta Sharing

Paperfield can expose a temporary HTTPS address through Cloudflare Quick Tunnel without purchasing a domain. The shared instance is separate from the personal instance at `http://127.0.0.1:8765`.

## Isolation

The beta profile lives under the ignored path:

```text
data/profiles/beta/
```

On first preparation, Paperfield copies the public paper and GitHub project catalog, then removes:

- Reading status, favorites, notes, and explanations.
- Paper and project chats.
- Local/cloud PDF records.
- Downloaded project source and project explanations.
- R2 inventory and usage records.

R2 is explicitly disabled for the beta process. Beta accounts share this one beta workspace with each other, but they do not modify the personal workspace.

The beta process can use the host computer's current CC Switch/OpenAI-compatible configuration for AI explanations. Requests therefore consume the host account's model quota.

## Accounts

Paperfield allows at most four shared-instance accounts. The ignored registry is:

```text
data/profiles/beta/auth-users.json
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

## Start Sharing

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-beta-share.ps1
```

The script starts the protected beta instance on local port `8876`, then prints an address similar to:

```text
https://random-words.trycloudflare.com
```

Send the HTTPS address and account credentials to the tester through separate private messages. Keep the PowerShell window open while the tester is using Paperfield. The temporary address changes after the tunnel restarts.

Press `Ctrl+C` in the sharing window to stop the tunnel and beta server. If the server remains after an interrupted terminal session, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\stop-beta-share.ps1
```

## Limits

- The host computer must remain online.
- Quick Tunnel is intended for temporary testing and has no stable hostname guarantee.
- All beta accounts share the beta reading history.
- Model requests use the host's configured provider and quota.
- The personal R2 archive is unavailable inside the beta profile.
