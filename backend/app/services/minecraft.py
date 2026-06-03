import re

PLAYERS_RE = re.compile(r"There are (?P<count>\d+) of a max of (?P<max>\d+) players online: ?(?P<players>.*)")


def parse_list_response(response: str) -> dict:
    match = PLAYERS_RE.search(response.strip())
    if not match:
        return {"online": None, "max": None, "players": [], "raw": response}

    players_raw = match.group("players").strip()
    players = [player.strip() for player in players_raw.split(",") if player.strip()]
    return {
        "online": int(match.group("count")),
        "max": int(match.group("max")),
        "players": players,
        "raw": response,
    }
