from pathlib import Path
import subprocess

import typer

app = typer.Typer(help="CODEVERSE: explore any Git repository as a 3D universe.")


@app.command()
def analyze(
    repo: Path = typer.Argument(Path("."), help="Path to a local Git repository."),
    output: Path = typer.Option(Path("repo.json"), "--output", "-o", help="Destination JSON bundle."),
    rev: str = typer.Option("HEAD", help="Commit, tag, or branch to analyze."),
):
    """Export first-parent Git history for the 3D viewer. No API key needed."""
    from codeverse.bundle import build_bundle, write_bundle

    try:
        bundle = build_bundle(repo, rev)
        destination = write_bundle(bundle, output)
    except (ValueError, OSError, RuntimeError, subprocess.SubprocessError) as exc:
        typer.echo(f"Analysis failed: {exc}", err=True)
        raise typer.Exit(code=1) from exc
    typer.echo(f"Exported {len(bundle['commits']):,} commits, {len(bundle['nodes']):,} paths, "
               f"{len(bundle['events']):,} events → {destination}")


@app.command()
def llm_check():
    """Ping the configured LLM provider."""
    from codeverse.llm import chat

    typer.echo(chat("Reply with exactly: CODEVERSE online"))


if __name__ == "__main__":
    app()
