"""Plotting that works in the Flow Lab website's Python lab and on a desktop.

In the browser (Pyodide) plots are drawn by the page with Plotly. On a desktop
matplotlib is used if installed; otherwise the data is printed.
"""
import json


def line(x, series, title="", xlabel="", ylabel=""):
    """Plot one or more lines. ``series`` maps a legend name to a list of y values."""
    try:
        import js  # only exists inside Pyodide
        js.flowlabPlot(json.dumps(dict(x=list(x), series={k: list(v) for k, v in series.items()},
                                       title=title, xlabel=xlabel, ylabel=ylabel)))
        return
    except ImportError:
        pass
    try:
        import matplotlib.pyplot as plt
        for name, y in series.items():
            plt.plot(x, y, label=name)
        plt.title(title); plt.xlabel(xlabel); plt.ylabel(ylabel)
        plt.grid(True); plt.legend(); plt.show()
    except ImportError:
        print(title)
        for name, y in series.items():
            print(name, [round(v, 5) for v in y[:: max(1, len(y) // 10)]])
