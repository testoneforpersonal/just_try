FROM electronuserland/builder:wine

# Create a new user 'admin' and add to sudoers
RUN useradd --uid 1000 -m admin && \
    apt-get update && \
    apt-get -y install sudo && \
    echo "admin ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/admin && \
    chmod 0440 /etc/sudoers.d/admin

# Install node and npm
RUN apt-get update && apt-get install -y \
    curl \
    software-properties-common \
    npm
RUN npm install npm@latest -g && \
    npm install n -g && \
    n lts

# Install necessary packages
RUN apt-get update && \
    apt-get install -y \
    python3 \
    python3-pip \
    ssh \
    && rm -rf /var/lib/apt/lists/*

RUN chmod -R 777 /var/opt

# Switch to non-root user
USER admin