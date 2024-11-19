import {
    DescribeSecretCommand,
    GetSecretValueCommand,
    PutSecretValueCommand,
    ResourceNotFoundException,
    SecretsManagerClient,
    UpdateSecretVersionStageCommand
} from "@aws-sdk/client-secrets-manager"
import {SecretsManagerRotationHandler} from "aws-lambda"
import {SecretsManagerRotationEvent} from "aws-lambda/trigger/secretsmanager";
import axios from "axios";
import {
    DescribeSecretResponse
} from "@aws-sdk/client-secrets-manager/dist-types/models/models_0";
import {addDays, format} from "date-fns";

const TRIPLETEX_API_BASE_URL = process.env.TRIPLETEX_API_BASE_URL!!
const TRIPLETEX_CONSUMER_TOKEN_SECRET_ARN = process.env.TRIPLETEX_CONSUMER_TOKEN_SECRET_ARN!!
const TRIPLETEX_EMPLOYEE_TOKEN_SECRET_ARN = process.env.TRIPLETEX_EMPLOYEE_TOKEN_SECRET_ARN!!
const TRIPLETEX_SESSION_TOKEN_DURATION_IN_DAYS = Number(process.env.TRIPLETEX_SESSION_TOKEN_DURATION_IN_DAYS!!)

const secretsManagerClient = new SecretsManagerClient()

export const handler: SecretsManagerRotationHandler = async event => {
    console.debug("Event:", JSON.stringify(event))

    const secret = await secretsManagerClient.send(
        new DescribeSecretCommand({
            SecretId: event.SecretId,
        })
    )

    const arn = event.SecretId
    const token = event.ClientRequestToken
    const versions = secret.VersionIdsToStages!!

    if (secret.RotationEnabled !== true) {
        throw Error(`Secret ${arn} is not enabled for rotation.`)
    }

    if (!Object.keys(versions).includes(token)) {
        throw Error(`Version ${token} has no stage for rotation of secret ${arn}.`)
    }

    if (versions[token].includes("AWSCURRENT")) {
        console.info(`Version ${token} is already set as AWSCURRENT for secret ${arn}.`)
        return
    } else if (!versions[token].includes("AWSPENDING")) {
        throw Error(`Version ${token} is not set as AWSPENDING for rotation of secret ${arn}.`)
    }

    switch (event.Step) {
        case "createSecret":
            await createSecret(event)
            break;
        case "setSecret":
            await setSecret(event)
            break;
        case "testSecret":
            await testSecret(event)
            break;
        case "finishSecret":
            await finishSecret(event, secret)
            break;
    }
}

/*
 This method first checks for the existence of a secret for the passed in token.
 If one does not exist, it will generate a new secret and put it with the passed in token.
 */
const createSecret = async (event: SecretsManagerRotationEvent): Promise<void> => {
    // Make sure the current secret value exists
    const currentSecretValue = await secretsManagerClient.send(
        new GetSecretValueCommand({
            SecretId: event.SecretId,
            VersionStage: "AWSCURRENT"
        })
    );

    // Try to get the pending secret value, if that fails, put a new secret
    try {
        await secretsManagerClient.send(
            new GetSecretValueCommand({
                SecretId: event.SecretId,
                VersionId: event.ClientRequestToken,
                VersionStage: "AWSPENDING"
            })
        )
    } catch (error) {
        switch (error.constructor) {
            case ResourceNotFoundException:
                const consumerTokenSecretValue = await secretsManagerClient.send(
                    new GetSecretValueCommand({
                        SecretId: TRIPLETEX_CONSUMER_TOKEN_SECRET_ARN
                    })
                )

                const employeeTokenSecretValue = await secretsManagerClient.send(
                    new GetSecretValueCommand({
                        SecretId: TRIPLETEX_EMPLOYEE_TOKEN_SECRET_ARN
                    })
                )

                const expirationDate = addDays(new Date(), TRIPLETEX_SESSION_TOKEN_DURATION_IN_DAYS)

                const sessionTokenResponse = await axios({
                    method: "put",
                    url: `${TRIPLETEX_API_BASE_URL}/token/session/:create`,
                    params: {
                        consumerToken: consumerTokenSecretValue.SecretString,
                        employeeToken: employeeTokenSecretValue.SecretString,
                        expirationDate: format(expirationDate, "yyyy-MM-dd")
                    }
                })

                await secretsManagerClient.send(
                    new PutSecretValueCommand({
                        SecretId: event.SecretId,
                        SecretString: sessionTokenResponse.data.value.token,
                        ClientRequestToken: event.ClientRequestToken,
                        VersionStages: ["AWSPENDING"]
                    })
                )
                console.info(`Successfully put value for version ${event.ClientRequestToken} of secret ${event.SecretId}.`)
                return;

            default:
                throw error
        }
    }
}

// This method should set the AWSPENDING secret in the service that the secret belongs to.
// For example, if the secret is a database credential, this method should take the value of the AWSPENDING secret and set the user's password to this value in the database.
const setSecret = async (event: SecretsManagerRotationEvent): Promise<void> => {
    console.info(`Skipping set version ${event.ClientRequestToken} of secret ${event.SecretId}, as it was set when secret was created.`)
    return;
}

// This method should validate that the AWSPENDING secret works in the service that the secret belongs to.
const testSecret = async (event: SecretsManagerRotationEvent): Promise<void> => {

    const pendingSecretValue = await secretsManagerClient.send(
        new GetSecretValueCommand({
            SecretId: event.SecretId,
            VersionId: event.ClientRequestToken,
            VersionStage: "AWSPENDING",
        })
    )

    const loggedInUserResponse = await axios({
        method: "get",
        url: `${TRIPLETEX_API_BASE_URL}/token/session/>whoAmI`,
        auth: {
            username: "",
            password: pendingSecretValue.SecretString!!,
        },
    })

    console.info(loggedInUserResponse.data)

    console.info(`Successfully tested version ${event.ClientRequestToken} of secret ${event.SecretId}.`)
}

// Finalizes the rotation process by marking the secret version passed in as the AWSCURRENT secret.
const finishSecret = async (event: SecretsManagerRotationEvent, secret: DescribeSecretResponse): Promise<void> => {

    const currentVersionId = Object.entries(secret.VersionIdsToStages!!)
        .find(([, stages]) => stages.includes("AWSCURRENT"))
        ?.[0]

    if (currentVersionId == event.ClientRequestToken) {
        console.info(`Stage for version ${event.ClientRequestToken} is already marked as AWSCURRENT for secret ${event.SecretId}.`)
        return;
    }

    await secretsManagerClient.send(
        new UpdateSecretVersionStageCommand({
            SecretId: event.SecretId,
            MoveToVersionId: event.ClientRequestToken,
            RemoveFromVersionId: currentVersionId,
            VersionStage: "AWSCURRENT",
        })
    )

    console.info(`Successfully set AWSCURRENT stage to version ${event.ClientRequestToken} for secret ${event.SecretId}.`)
}
