"""Command Line Interface for the Dual-Process Laya Agent."""

import sys

import typer
from rich import box
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from laya_agent.agent import DualProcessAgent
from laya_agent.config import Settings
from laya_agent.models import QuestionType

app = typer.Typer(
    name="laya-agent",
    help="Dual-Process AI Agent combining Gemini 3.5 Flash-Lite and ConvAI Laya",
    add_completion=False,
)
console = Console()


@app.command()
def decide(
    query: str = typer.Argument(..., help="The query or scenario to evaluate"),
    criteria: list[str] = typer.Option(
        ["yes:Rain is likely", "no:Dry or negligible rain chance"],
        "--criteria",
        "-c",
        help="Criteria in 'key:description' format",
    ),
    question_type: str = typer.Option(
        "choice", "--type", "-t", help="Question type: choice or score"
    ),
    threshold: float = typer.Option(
        0.60, "--threshold", help="Confidence threshold to trigger System 2"
    ),
    search: bool = typer.Option(True, "--search/--no-search", help="Enable web search grounding"),
    attribution: bool = typer.Option(
        True, "--attribution/--no-attribution", help="Compute source attribution"
    ),
    force_s2: bool = typer.Option(False, "--force-s2", help="Force System 2 deliberation"),
) -> None:
    """Run a dual-process decision on a query."""
    criteria_dict = {}
    for item in criteria:
        if ":" in item:
            k, v = item.split(":", 1)
            criteria_dict[k.strip()] = v.strip()
        else:
            criteria_dict[item.strip()] = item.strip()

    q_type = QuestionType.CHOICE if question_type.lower() == "choice" else QuestionType.SCORE

    console.print(f"[bold cyan]Query:[/bold cyan] {query}")
    with console.status("[bold green]Executing Dual-Process Decision Pipeline...[/bold green]"):
        settings = Settings(confidence_threshold=threshold)
        agent = DualProcessAgent(settings=settings)
        result = agent.decide(
            query=query,
            criteria=criteria_dict,
            question_type=q_type,
            enable_search=search,
            compute_attribution=attribution,
            force_system2=force_s2,
        )

    # Render results table
    table = Table(title="Decision Summary", box=box.ROUNDED)
    table.add_column("Field", style="cyan", no_wrap=True)
    table.add_column("Value", style="bold white")

    table.add_row("Winning Decision", f"[bold green]{result.decision.upper()}[/bold green]")
    table.add_row("Execution Path", f"[magenta]{result.handled_by}[/magenta]")
    table.add_row("Confidence Score", f"{result.confidence:.4f}")
    table.add_row("Total Latency", f"{result.total_latency_ms:.1f} ms")

    prob_str = ", ".join(f"{k}: {v:.2%}" for k, v in result.probabilities.items())
    table.add_row("Calibrated Probabilities", prob_str)
    console.print(table)

    # Render source attribution table if available
    if result.sources:
        src_table = Table(title="Leave-One-Out Source Attribution", box=box.SIMPLE)
        src_table.add_column("Impact", justify="right", style="bold")
        src_table.add_column("Web Source / Citation", style="dim")

        for src in result.sources:
            sign = "+" if src.impact_points >= 0 else ""
            color = "green" if src.impact_points >= 0 else "red"
            impact_text = f"[{color}]{sign}{src.impact_points:.2f} pts[/{color}]"
            src_table.add_row(impact_text, src.source_text)

        console.print(src_table)

    # Render System 2 Deliberation Panel if invoked
    if result.system2_synthesis:
        console.print(
            Panel(
                result.system2_synthesis.explanation,
                title="[bold yellow]System 2 Deliberative Synthesis[/bold yellow]",
                border_style="yellow",
            )
        )


@app.command()
def compare(
    query: str = typer.Argument(..., help="The query or scenario to evaluate"),
    criteria: list[str] = typer.Option(
        ["yes:Rain is likely", "no:Dry or negligible rain chance"],
        "--criteria",
        "-c",
        help="Criteria in 'key:description' format",
    ),
    question_type: str = typer.Option(
        "choice", "--type", "-t", help="Question type: choice or score"
    ),
    search: bool = typer.Option(True, "--search/--no-search", help="Enable web search grounding"),
    attribution: bool = typer.Option(
        True, "--attribution/--no-attribution", help="Compute source attribution"
    ),
) -> None:
    """Run a side-by-side comparison of ConvAI Laya vs TypeSafe Jev."""
    criteria_dict = {}
    for item in criteria:
        if ":" in item:
            k, v = item.split(":", 1)
            criteria_dict[k.strip()] = v.strip()
        else:
            criteria_dict[item.strip()] = item.strip()

    q_type = QuestionType.CHOICE if question_type.lower() == "choice" else QuestionType.SCORE

    console.print(f"[bold cyan]Query:[/bold cyan] {query}")
    with console.status("[bold green]Running Parallel Evaluation: Laya vs Jev...[/bold green]"):
        agent = DualProcessAgent()
        result = agent.compare(
            query=query,
            criteria=criteria_dict,
            question_type=q_type,
            enable_search=search,
            compute_attribution=attribution,
        )

    # Comparison Table
    table = Table(title="System 1 Benchmark: ConvAI Laya vs TypeSafe Jev", box=box.ROUNDED)
    table.add_column("Evaluation Dimension", style="cyan", no_wrap=True)
    table.add_column("ConvAI Laya (GPU Spot)", style="bold green")
    table.add_column("TypeSafe Jev (SaaS)", style="bold blue")

    match_str = (
        "[bold green]MATCH[/bold green]" if result.agreement else "[bold red]DIVERGENCE[/bold red]"
    )
    l_choice = result.laya.choice.upper() if result.laya.choice else "-"
    j_choice = result.jev.choice.upper() if result.jev.choice else "-"
    table.add_row("Winning Choice", l_choice, j_choice)
    table.add_row("Consensus", match_str, match_str)

    laya_probs = ", ".join(f"{k}: {v:.1%}" for k, v in result.laya.probabilities.items())
    jev_probs = ", ".join(f"{k}: {v:.1%}" for k, v in result.jev.probabilities.items())
    table.add_row("Probabilities", laya_probs, jev_probs)

    table.add_row(
        "Confidence Score", f"{result.laya.confidence:.4f}", f"{result.jev.confidence:.4f}"
    )
    table.add_row(
        "Engine Latency (P50)",
        f"{result.laya.latency_ms:.1f} ms",
        f"{result.jev.latency_ms:.1f} ms",
    )

    faster = "Laya" if result.latency_diff_ms > 0 else "Jev"
    table.add_row(
        "Latency Delta",
        f"{abs(result.latency_diff_ms):.1f} ms ({faster} faster)",
        f"{result.speedup_factor:.1f}x speedup",
    )
    table.add_row("Hosting Architecture", "Self-Hosted Private VPC", "Multi-Tenant SaaS")
    table.add_row("Cost Model", "$0.28 / hour (unlimited)", "$0.0005 / call")

    console.print(table)

    # Leave-One-Out Attribution Comparison
    if result.laya.sources or result.jev.sources:
        src_table = Table(title="Leave-One-Out Source Attribution Comparison", box=box.SIMPLE)
        src_table.add_column("Laya Impact", justify="right", style="bold")
        src_table.add_column("Jev Impact", justify="right", style="bold")
        src_table.add_column("Source / Citation", style="dim")

        jev_sources_map = {s.source_text: s.impact_points for s in result.jev.sources}
        for s in result.laya.sources:
            l_sign = "+" if s.impact_points >= 0 else ""
            l_color = "green" if s.impact_points >= 0 else "red"
            l_text = f"[{l_color}]{l_sign}{s.impact_points:.2f} pts[/{l_color}]"

            j_pts = jev_sources_map.get(s.source_text, 0.0)
            j_sign = "+" if j_pts >= 0 else ""
            j_color = "blue" if j_pts >= 0 else "red"
            j_text = f"[{j_color}]{j_sign}{j_pts:.2f} pts[/{j_color}]"

            src_table.add_row(l_text, j_text, s.source_text)

        console.print(src_table)


@app.command()
def status() -> None:
    """Check connectivity to Cloud Run Laya proxy and Vertex AI."""
    settings = Settings()
    console.print(f"[bold]Project ID:[/bold] {settings.project_id}")
    console.print(f"[bold]Vertex Location:[/bold] {settings.vertex_location}")
    console.print(f"[bold]Gemini Model:[/bold] {settings.gemini_model}")
    console.print(f"[bold]Laya Endpoint:[/bold] {settings.laya_endpoint}")

    with console.status("[bold green]Probing Laya Proxy...[/bold green]"):
        try:
            agent = DualProcessAgent(settings=settings)
            res = agent.system1.predict(
                query="Health probe status check",
                criteria={"ok": "System is healthy", "fail": "System is degraded"},
                enable_search=False if hasattr(agent.system1, "enable_search") else None,
            )
            console.print(
                f"[bold green]✓ Laya Proxy OK[/bold green] (Latency: {res.latency_ms:.1f} ms)"
            )
        except Exception as e:
            console.print(f"[bold red]✗ Laya Proxy Failed:[/bold red] {e}")


@app.command()
def interactive() -> None:
    """Start interactive decision console."""
    console.print(
        Panel("[bold green]Laya Dual-Process Agent Console[/bold green]\nType 'exit' to quit.")
    )
    agent = DualProcessAgent()

    while True:
        try:
            query = console.input("\n[bold cyan]Enter Question / Scenario > [/bold cyan]").strip()
            if not query or query.lower() in ["exit", "quit", "q"]:
                break

            with console.status("[bold green]Evaluating...[/bold green]"):
                res = agent.decide(
                    query=query,
                    criteria={
                        "yes": "Positive outcome / affirmative",
                        "no": "Negative outcome / denial",
                    },
                )

            console.print(
                f"[bold green]Decision:[/bold green] {res.decision.upper()} ({res.handled_by})"
            )
            console.print(
                f"[dim]Probabilities: {res.probabilities} | "
                f"Latency: {res.total_latency_ms:.1f} ms[/dim]"
            )
        except KeyboardInterrupt:
            break
        except Exception as e:
            console.print(f"[bold red]Error:[/bold red] {e}")


def main() -> None:
    """Main CLI entrypoint."""
    if len(sys.argv) == 1:
        # Default to decide with sample query
        sys.argv.extend(["decide", "Should I take an umbrella in Tokyo today?"])
    app()


if __name__ == "__main__":
    main()
