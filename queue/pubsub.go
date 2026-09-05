// Google Cloud Pub/Sub publisher for production PR-review jobs.
package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"

	"cloud.google.com/go/pubsub"
	"devmind/gateway/models"
)

var (
	pubsubClient *pubsub.Client
	pubsubTopic  *pubsub.Topic
)

func initPubSub() {
	projectID := os.Getenv("GCP_PROJECT_ID")
	if projectID == "" {
		log.Fatal("GCP_PROJECT_ID is required when QUEUE_BACKEND=pubsub")
	}

	topicID := os.Getenv("PUBSUB_TOPIC")
	if topicID == "" {
		topicID = "devmind-pr-jobs"
	}

	ctx := context.Background()
	client, err := pubsub.NewClient(ctx, projectID)
	if err != nil {
		log.Fatalf("pubsub client: %v", err)
	}

	topic := client.Topic(topicID)
	topic.PublishSettings.CountThreshold = 1

	pubsubClient = client
	pubsubTopic = topic
	log.Printf("pubsub publisher ready topic=%s project=%s", topicID, projectID)
}

func publishPubSub(ctx context.Context, payload any) error {
	if pubsubTopic == nil {
		return fmt.Errorf("pubsub topic is not initialized")
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	msg := &pubsub.Message{Data: data}
	if job, ok := payload.(models.Job); ok {
		msg.Attributes = map[string]string{
			"job_id":          job.ID,
			"delivery_id":     job.DeliveryID,
			"idempotency_key": job.IdempotencyKey,
		}
	}
	result := pubsubTopic.Publish(ctx, msg)
	_, err = result.Get(ctx)
	return err
}
