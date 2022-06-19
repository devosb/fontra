import argparse
from importlib.metadata import entry_points
import logging
import pathlib
import sys
from .core.server import FontraServer


def existingFolder(path):
    path = pathlib.Path(path).resolve()
    if not path.is_dir():
        raise argparse.ArgumentError("not a directory")
    return path


def main():
    logging.basicConfig(
        format="%(asctime)s %(name)-17s %(levelname)-8s %(message)s",
        level=logging.INFO,
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="localhost")
    parser.add_argument("--http-port", default=8000, type=int)
    parser.add_argument("--websocket-port", type=int)
    parser.add_argument("--websocket-proxy-port", type=int)
    subParsers = parser.add_subparsers(required=True)
    for entryPoint in entry_points(group="fontra.projectmanagers"):
        subParser = subParsers.add_parser(entryPoint.name)
        pmFactory = entryPoint.load()
        pmFactory.addArguments(subParser)
        subParser.set_defaults(getProjectManager=pmFactory.getProjectManager)

    args = parser.parse_args()

    host = args.host
    httpPort = args.http_port
    webSocketPort = (
        args.websocket_port if args.websocket_port is not None else httpPort + 1
    )
    webSocketProxyPort = (
        args.websocket_proxy_port
        if args.websocket_proxy_port is not None
        else webSocketPort
    )

    manager = args.getProjectManager(args)
    server = FontraServer(
        host=host,
        httpPort=httpPort,
        webSocketPort=webSocketPort,
        webSocketProxyPort=webSocketProxyPort,
        projectManager=manager,
    )
    server.setup()
    server.run()


if __name__ == "__main__":
    main()
