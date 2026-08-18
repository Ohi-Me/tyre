"""Telemetry setup — OpenTelemetry + structlog.

Y1: structlog only (always available).
Y2+: OpenTelemetry traces (optional — graceful degradation if not installed).
"""
from __future__ import annotations

import logging

import structlog

from app.config import settings


def setup_telemetry():
    # Structlog — always set up
    structlog.configure(
        processors=[
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.add_log_level,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
        cache_logger_on_first_use=True,
    )

    # OpenTelemetry — optional in Y1 (requires 'y2' extras to be installed)
    if settings.otlp_endpoint:
        try:
            from opentelemetry import trace
            from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
            from opentelemetry.sdk.resources import Resource
            from opentelemetry.sdk.trace import TracerProvider
            from opentelemetry.sdk.trace.export import BatchSpanProcessor

            resource = Resource.create({"service.name": "tyre-ai-gateway", "service.version": "3.2.0"})
            provider = TracerProvider(resource=resource)
            provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint=settings.otlp_endpoint)))
            trace.set_tracer_provider(provider)
        except ImportError:
            logging.warning("OpenTelemetry not installed — install with: pip install -e '.[y2]'")
        except Exception as e:
            logging.warning(f"OpenTelemetry setup failed: {e}")
