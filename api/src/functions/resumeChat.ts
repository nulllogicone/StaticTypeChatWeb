import { app, HttpRequest, HttpResponseInit, InvocationContext, output } from "@azure/functions";
import * as fs from "fs";
import * as path from "path";
import { createLanguageModel, createJsonTranslator, processRequests } from "typechat";
import { Cart } from "./coffeeShopSchema";

const maxDate = new Date("9999-12-31");
const model = createLanguageModel(process.env);
const schema = fs.readFileSync(path.join(__dirname, "coffeeShopSchema.ts"), "utf8");
const translator = createJsonTranslator<Cart>(model, schema, "Cart");

const tableOutput = output.table({
    tableName: 'History',
    connection: 'MyStorageConnectionAppSetting'
});

interface HistoryEntity {
    PartitionKey: string;
    RowKey: string;
    Prompt: string;
    Response: string;
}

export async function resumeChat(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`Http function name: "${context.functionName}" processed request for url "${request.url}"`);

    const requestBody = JSON.parse(await request.text());
    let prompt = requestBody.prompt || 'say something funny';

    // Get response from TypeChat
    const response = await translator.translate(prompt);
    if (!response.success) {
        console.log(response);
        return;
    }
    const cart = response.data;

    // Save the request message to Azure Table Storage.
    const history: HistoryEntity[] = [];
    var rowKeyValue = (maxDate.getTime() - (new Date()).getTime()).toString();
    history.push({
        PartitionKey: context.functionName,
        RowKey: rowKeyValue,
        Prompt: prompt,
        Response: JSON.stringify(cart)
    });
    context.extraOutputs.set(tableOutput, history);

    return {
        body: JSON.stringify(cart, undefined, 2),
        headers: {
            'Content-Type': 'application/json'
        }
    };
};

app.http('resumeChat', {
    methods: ['POST'],
    authLevel: 'anonymous',
    extraOutputs: [tableOutput],
    handler: resumeChat
});
