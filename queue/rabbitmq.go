// RabbitMQ producer for PR-review jobs.
// Declares a durable queue with a dead-letter exchange on init.
package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"

	amqp "github.com/rabbitmq/amqp091-go"
)

const (
	RabbitJobQueue  = "devmind.pr_jobs"
	RabbitDLX       = "devmind.dlx"
	RabbitDLQueue   = "devmind.pr_jobs.dlq"
	RabbitExchange  = "" // default direct exchange
)

var rabbitConn *amqp.Connection
var rabbitCh *amqp.Channel

func rabbitURL() string {
	if u := os.Getenv("RABBITMQ_URL"); u != "" {
		return u
	}
	return "amqp://guest:guest@localhost:5672/"
}

func initRabbitMQ() {
	conn, err := amqp.Dial(rabbitURL())
	if err != nil {
		log.Fatalf("rabbitmq dial: %v", err)
	}

	ch, err := conn.Channel()
	if err != nil {
		log.Fatalf("rabbitmq channel: %v", err)
	}

	// Declare DLX and DLQ first.
	if err := ch.ExchangeDeclare(RabbitDLX, "direct", true, false, false, false, nil); err != nil {
		log.Fatalf("rabbitmq dlx declare: %v", err)
	}
	if _, err := ch.QueueDeclare(RabbitDLQueue, true, false, false, false, nil); err != nil {
		log.Fatalf("rabbitmq dlq declare: %v", err)
	}
	if err := ch.QueueBind(RabbitDLQueue, RabbitDLQueue, RabbitDLX, false, nil); err != nil {
		log.Fatalf("rabbitmq dlq bind: %v", err)
	}

	// Main job queue pointing dead letters at the DLX.
	_, err = ch.QueueDeclare(RabbitJobQueue, true, false, false, false, amqp.Table{
		"x-dead-letter-exchange":    RabbitDLX,
		"x-dead-letter-routing-key": RabbitDLQueue,
	})
	if err != nil {
		log.Fatalf("rabbitmq queue declare: %v", err)
	}

	rabbitConn = conn
	rabbitCh = ch
	log.Printf("rabbitmq producer ready queue=%s url=%s", RabbitJobQueue, rabbitURL())
}

func publishRabbitMQ(ctx context.Context, payload any) error {
	if rabbitCh == nil {
		return fmt.Errorf("rabbitmq channel not initialized")
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	return rabbitCh.PublishWithContext(ctx, RabbitExchange, RabbitJobQueue, false, false,
		amqp.Publishing{
			ContentType:  "application/json",
			DeliveryMode: amqp.Persistent,
			Body:         data,
		},
	)
}
