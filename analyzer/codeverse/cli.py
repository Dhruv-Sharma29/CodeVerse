import typer

app = typer.Typer(help="CODEVERSE: explore any Git repository as a 3D universe.")


@app.command()
def analyze(repo: str = typer.Argument(".", help="Path or URL of the repository.")):
    """Analyze a repository and write a .codeverse bundle (not implemented yet)."""
    typer.echo(f"analyze {repo}: coming in Phase 1")


@app.command()
def llm_check():
    """Ping the configured LLM provider."""
    from codeverse.llm import chat

    typer.echo(chat("Reply with exactly: CODEVERSE online"))


if __name__ == "__main__":
    app()
