# Debian 13 (trixie) is the current stable Debian release. Keep the Node
# major explicit while allowing Docker to receive rebuilt security updates.
FROM node:24-trixie-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    git \
    iproute2 \
    ripgrep \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g --ignore-scripts @earendil-works/pi-coding-agent \
  && useradd --create-home --shell /bin/bash pi

# Customizations are copied into the image at build time. The host repository is
# not mounted when the sandbox runs.
COPY . /opt/pi-customizations
COPY bin/pi-openshell-entrypoint /usr/local/bin/pi-openshell-entrypoint
RUN chmod 755 /usr/local/bin/pi-openshell-entrypoint \
  && node /opt/pi-customizations/bin/patch-pi-codex

RUN mkdir -p /home/pi/.pi/agent \
  && cp /opt/pi-customizations/APPEND_SYSTEM.md /home/pi/.pi/agent/APPEND_SYSTEM.md \
  && cp -a /opt/pi-customizations/agents /home/pi/.pi/agent/agents \
  && printf '%s\n' '{' \
    '  "extensions": ["/opt/pi-customizations/extensions"],' \
    '  "skills": ["/opt/pi-customizations/skills"],' \
    '  "themes": ["/opt/pi-customizations/themes"]' \
    '}' > /home/pi/.pi/agent/settings.json \
  && chown -R pi:pi /home/pi/.pi \
  && mkdir -p /workspace \
  && chown pi:pi /workspace

ENV HOME=/home/pi \
  PI_CODING_AGENT_DIR=/home/pi/.pi/agent
WORKDIR /workspace
USER pi
ENTRYPOINT ["/usr/local/bin/pi-openshell-entrypoint"]
