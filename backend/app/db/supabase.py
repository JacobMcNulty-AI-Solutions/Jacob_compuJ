from supabase import create_client, Client

from app.core.config import settings


def get_supabase_client() -> Client:
    """
    Creates and returns a Supabase client instance using service role key
    for bypassing Row Level Security policies
    """
    return create_client(
        supabase_url=settings.SUPABASE_URL,
        supabase_key=settings.SUPABASE_SERVICE_ROLE_KEY
    )


# Initialize the Supabase client for global use
supabase_client = get_supabase_client() 