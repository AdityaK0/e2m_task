"""Interactive command-line tools for workspace administration."""

import click
from pydantic import EmailStr, TypeAdapter, ValidationError

from app.config import settings
from app.database import SessionLocal
from app.seed import create_admin
from app.utils.exceptions import AppException


email_adapter = TypeAdapter(EmailStr)


@click.group()
def cli() -> None:
    """E2M Insights administration commands."""


@cli.command("createadmin")
def createadmin() -> None:
    """Create a new administrator account."""
    try:
        email = str(
            email_adapter.validate_python(click.prompt("Admin email").strip())
        ).lower()
    except ValidationError as exc:
        raise click.ClickException("Enter a valid email address.") from exc

    password = click.prompt(
        "Admin password",
        hide_input=True,
        confirmation_prompt=True,
    )
    name = settings.BOOTSTRAP_ADMIN_NAME.strip() or "Administrator"

    db = SessionLocal()
    try:
        user = create_admin(db, email=email, password=password, name=name)
    except AppException as exc:
        raise click.ClickException(exc.message) from exc
    finally:
        db.close()

    click.echo(f"Created admin account: {user.email}")


def main() -> None:
    cli()


if __name__ == "__main__":
    main()
