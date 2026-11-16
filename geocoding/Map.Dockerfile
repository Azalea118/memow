FROM python:3.12-slim-bookworm

RUN sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources \
 && apt-get -o Acquire::https::Timeout=30 -o Acquire::Retries=2 -o APT::Update::Error-Mode=any update \
 && apt-get -o Acquire::https::Timeout=30 -o Acquire::Retries=2 install -y --no-install-recommends osmium-tool curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY prepare-map.sh /prepare-map.sh
RUN sed -i 's/\r$//' /prepare-map.sh
ENTRYPOINT ["sh", "/prepare-map.sh"]
