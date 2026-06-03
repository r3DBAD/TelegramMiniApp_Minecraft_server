import argparse
import os

from app.services.rcon import RconClient


def main() -> None:
    parser = argparse.ArgumentParser(description="Check Minecraft RCON connectivity.")
    parser.add_argument("--host", default=os.getenv("RCON_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.getenv("RCON_PORT", "25575")))
    parser.add_argument("--password", default=os.getenv("RCON_PASSWORD", ""))
    parser.add_argument("--command", default="list")
    args = parser.parse_args()

    if not args.password:
        raise SystemExit("RCON_PASSWORD is empty")

    client = RconClient(args.host, args.port, args.password)
    print(client._command_sync(args.command))


if __name__ == "__main__":
    main()
