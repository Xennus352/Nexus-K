# Typical usage:
#   docker build --build-arg "BUILDVERS=$(git describe --tags --always)" --progress=plain --pull --rm -f "Dockerfile" -t slotopol:latest .
#   docker run -d -p 8080:8080 slotopol

##
## Build stage
##

# Use image with golang last version as builder.
FROM golang:1.27-bookworm AS builder

# Make project root folder as current dir.
WORKDIR /go/src/github.com/slotopol/server

# Copy only go.mod and go.sum to prevent downloads all dependencies again on any code changes.
COPY go.mod go.sum ./
# Download all dependencies pointed at go.mod file.
RUN go mod download
# Copy all files and subfolders in current state as is.
COPY . .

# Declare build version to be set at build time. Default value is "unknown" if not set.
ARG BUILDVERS=unknown

# Set executable rights to all shell-scripts.
RUN chmod +x ./task/*.sh
# Compile project for Linux amd64.
RUN ./task/build-docker.sh

##
## Deploy stage
##

# Thin deploy image with minimal base for shell/entrypoint.
FROM gcr.io/distroless/static-debian12:nonroot

# Copy compiled executable and configuration files to new image destination.
COPY --from=builder /go/bin /go/bin
# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh

# Open REST listen port.
EXPOSE 8080

# Run application with entrypoint for config handling.
ENTRYPOINT ["/entrypoint.sh"]
CMD ["-v", "web"]