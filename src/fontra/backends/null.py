from dataclasses import dataclass

from .base import BaseBackend


@dataclass(frozen=True)
class NullBackend(BaseBackend):
    def __new__(cls):
        if not hasattr(cls, "instance"):
            cls.instance = super().__new__(cls)
        return cls.instance
