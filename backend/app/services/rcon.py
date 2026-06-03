import asyncio

from mcrcon import MCRcon


class RconClient:
    def __init__(self, host: str, port: int, password: str) -> None:
        self.host = host
        self.port = port
        self.password = password

    async def command(self, command: str) -> str:
        return await asyncio.to_thread(self._command_sync, command)

    def _command_sync(self, command: str) -> str:
        with MCRcon(self.host, self.password, port=self.port) as rcon:
            return rcon.command(command)
