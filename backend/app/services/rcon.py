import asyncio
import socket
import struct


class RconError(RuntimeError):
    pass


class RconClient:
    AUTH = 3
    COMMAND = 2

    def __init__(self, host: str, port: int, password: str, timeout: float = 5.0) -> None:
        self.host = host
        self.port = port
        self.password = password
        self.timeout = timeout

    async def command(self, command: str) -> str:
        return await asyncio.to_thread(self._command_sync, command)

    def _command_sync(self, command: str) -> str:
        with socket.create_connection((self.host, self.port), timeout=self.timeout) as connection:
            connection.settimeout(self.timeout)
            self._send_packet(connection, request_id=1, packet_type=self.AUTH, payload=self.password)
            auth_id, _, _ = self._read_packet(connection)
            if auth_id == -1:
                raise RconError("RCON authentication failed")

            self._send_packet(connection, request_id=2, packet_type=self.COMMAND, payload=command)
            response_id, _, payload = self._read_packet(connection)
            if response_id != 2:
                raise RconError("Unexpected RCON response id")
            return payload

    @staticmethod
    def _send_packet(
        connection: socket.socket,
        request_id: int,
        packet_type: int,
        payload: str,
    ) -> None:
        payload_bytes = payload.encode("utf-8")
        body = struct.pack("<ii", request_id, packet_type) + payload_bytes + b"\x00\x00"
        connection.sendall(struct.pack("<i", len(body)) + body)

    @staticmethod
    def _read_packet(connection: socket.socket) -> tuple[int, int, str]:
        length_data = RconClient._read_exact(connection, 4)
        length = struct.unpack("<i", length_data)[0]
        if length < 10:
            raise RconError("Malformed RCON packet")

        packet = RconClient._read_exact(connection, length)
        request_id, packet_type = struct.unpack("<ii", packet[:8])
        payload = packet[8:-2].decode("utf-8", errors="replace")
        return request_id, packet_type, payload

    @staticmethod
    def _read_exact(connection: socket.socket, size: int) -> bytes:
        chunks: list[bytes] = []
        remaining = size
        while remaining > 0:
            chunk = connection.recv(remaining)
            if not chunk:
                raise RconError("RCON connection closed")
            chunks.append(chunk)
            remaining -= len(chunk)
        return b"".join(chunks)
