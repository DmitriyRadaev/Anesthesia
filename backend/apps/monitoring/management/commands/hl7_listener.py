import logging
import socketserver

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import close_old_connections

from apps.monitoring.hl7 import HL7ParseError, MLLPBuffer
from apps.monitoring.ingest import store_message

logger = logging.getLogger("apps.monitoring.hl7")


class HL7Handler(socketserver.BaseRequestHandler):
    def handle(self):
        buffer = MLLPBuffer()
        peer = "%s:%s" % self.client_address
        logger.info("HL7: подключение %s", peer)
        while True:
            chunk = self.request.recv(65536)
            if not chunk:
                break
            for message in buffer.feed(chunk.decode("utf-8", errors="replace")):
                close_old_connections()
                try:
                    result = store_message(message)
                    logger.debug("HL7: сохранено pid=%s at=%s", result.pid, result.observation_at)
                except HL7ParseError as exc:
                    logger.warning("HL7: сообщение пропущено (%s)", exc)
                except Exception:  # одна ошибка БД не должна останавливать приём остальных сообщений
                    logger.exception("HL7: ошибка сохранения сообщения")
        logger.info("HL7: отключение %s", peer)


class ThreadingTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True


class Command(BaseCommand):
    help = "TCP-сервер приёма HL7-результатов от шлюза мониторов (eGateway, режим result). Аналог `artisan hl7:result`."

    def add_arguments(self, parser):
        parser.add_argument("--host", default=settings.HL7_LISTEN_HOST)
        parser.add_argument("--port", type=int, default=settings.HL7_LISTEN_PORT)

    def handle(self, *args, host, port, **options):
        self.stdout.write(self.style.SUCCESS(f"HL7 listener: {host}:{port}"))
        with ThreadingTCPServer((host, port), HL7Handler) as server:
            try:
                server.serve_forever()
            except KeyboardInterrupt:
                self.stdout.write("Остановлено.")
