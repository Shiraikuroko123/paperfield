from __future__ import annotations

import argparse
import getpass
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from paperfield.app import AuthService, DATA_DIR  # noqa: E402


DEFAULT_USERS_PATH = DATA_DIR / "profiles" / "beta" / "auth-users.json"


def password_value(use_stdin: bool) -> str:
    if use_stdin:
        return sys.stdin.readline().rstrip("\r\n")
    first = getpass.getpass("Password: ")
    second = getpass.getpass("Confirm password: ")
    if first != second:
        raise ValueError("Passwords do not match")
    return first


def main() -> None:
    parser = argparse.ArgumentParser(description="Manage Paperfield beta accounts")
    parser.add_argument("--path", type=Path, default=DEFAULT_USERS_PATH)
    subparsers = parser.add_subparsers(dest="command", required=True)

    list_parser = subparsers.add_parser("list", help="list beta accounts")
    list_parser.set_defaults(action="list")

    add_parser = subparsers.add_parser("add", help="add a beta or standard account")
    add_parser.add_argument("username")
    add_parser.add_argument("--display-name", default="")
    add_parser.add_argument("--role", choices=("beta", "standard"), default="standard")
    add_parser.add_argument("--password-stdin", action="store_true")
    add_parser.set_defaults(action="add")

    reset_parser = subparsers.add_parser("reset", help="reset an account password")
    reset_parser.add_argument("username")
    reset_parser.add_argument("--display-name", default="")
    reset_parser.add_argument("--role", choices=("beta", "standard"))
    reset_parser.add_argument("--password-stdin", action="store_true")
    reset_parser.set_defaults(action="reset")

    for command in ("enable", "disable"):
        user_parser = subparsers.add_parser(command, help=f"{command} a beta account")
        user_parser.add_argument("username")
        user_parser.set_defaults(action=command)

    args = parser.parse_args()
    service = AuthService(args.path, required=False)

    if args.action == "list":
        users = service.users()
        if not users:
            print("No beta accounts configured.")
            return
        for user in users:
            status = "enabled" if user["enabled"] else "disabled"
            print(f"{user['username']}\t{status}\t{user['role']}\t{user['display_name']}")
        return

    if args.action in {"add", "reset"}:
        password = password_value(args.password_stdin)
        existing = {item["username"] for item in service.users()}
        if args.action == "add" and args.username.lower() in existing:
            raise ValueError("Account already exists; use reset to change its password")
        if args.action == "reset" and args.username.lower() not in existing:
            raise ValueError("Account does not exist; use add first")
        user = service.upsert_user(args.username, password, args.display_name, args.role)
        print(f"Saved beta account: {user['username']}")
        return

    user = service.set_enabled(args.username, args.action == "enable")
    print(f"{args.action.title()}d beta account: {user['username']}")


if __name__ == "__main__":
    main()
