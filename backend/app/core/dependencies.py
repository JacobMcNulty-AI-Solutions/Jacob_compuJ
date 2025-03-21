from typing import Generator

from app.db.supabase import supabase_client, get_supabase_client


def get_db() -> Generator:
    """
    Dependency for getting a Supabase client instance
    """
    try:
        yield supabase_client
    finally:
        # No cleanup needed for Supabase client
        pass 