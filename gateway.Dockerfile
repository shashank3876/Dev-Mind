FROM golang:1.22-alpine AS build

RUN apk add --no-cache git ca-certificates

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY main.go ./
COPY handlers/ handlers/
COPY middleware/ middleware/
COPY models/ models/
COPY queue/ queue/

RUN CGO_ENABLED=0 GOOS=linux go build -o /gateway .

FROM gcr.io/distroless/static-debian12:nonroot

COPY --from=build /gateway /gateway

ENV PORT=8080
EXPOSE 8080

USER nonroot:nonroot

ENTRYPOINT ["/gateway"]
