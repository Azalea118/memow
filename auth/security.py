import hashlib
import hmac
import os


def hash_password(pw: str) -> str:
    salt = os.urandom(16)
    h = hashlib.scrypt(pw.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32)
    return f"{salt.hex()}${h.hex()}"


def check_password(pw: str, stored: str) -> bool:
    try:
        salt_hex, h_hex = stored.split("$")
        h = hashlib.scrypt(pw.encode(), salt=bytes.fromhex(salt_hex),
                           n=2**14, r=8, p=1, dklen=32)
        return hmac.compare_digest(h, bytes.fromhex(h_hex))
    except ValueError:
        return False


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
