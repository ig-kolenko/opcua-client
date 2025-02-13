/*
 * index.ts
 */

import * as opcua from 'node-opcua-client';


// set up our OPCUA configuration details

var config:any = {
    "opc": {
        "endpoint": "opc.tcp://127.0.0.1:26543",
        "connection": {
            "applicationName": "OPC-UA Reader",
            "connectionStrategy": {
                "initialDelay": 250,
                "maxDelay": 500,
                "maxRetry": 1
            },
            "endpointMustExist": false
        },
        "userIdentity": {
            "needed": false,
            "username": "user",
            "password": "user"
        },
        "subscription": {
            "parameters": {
                "requestedPublishingInterval": 1000,
                "requestedLifetimeCount": 100,
                "requestedMaxKeepAliveCount": 10,
                "maxNotificationsPerPublish": 100,
                "publishingEnabled": true,
                "priority": 10
            }
        }
    }
};




// this function showcases data reception as an event due to monitoring

async function handleDataReceived (tagname:string, dataValue: opcua.DataValue) 
{
    if (dataValue.value.dataType == opcua.DataType.Double) {
        let dvalue:number = dataValue.value.value;
        console.log(`  tag ${tagname} = ${dvalue}`);
    } else if (dataValue.value.dataType == opcua.DataType.Boolean) {
        let bvalue:boolean = dataValue.value.value;
        console.log(`  tag ${tagname} = ${bvalue}`);
    } else {
        console.log ("  unexpected");
    }
}



// this function will process our interval to directly read PLC data via OPCUA

async function processReadRequest (tags: string[], opcsession:opcua.ClientSession)
{
    let x:number = 0;

    for (x = 0; x < tags.length; x++) {
        let nodeID = "ns=1;s=" + tags[x];
        let dataValue = await opcsession.read ({ 
                nodeId: nodeID, 
                attributeId: opcua.AttributeIds.Value 
        });

        if (dataValue.value.dataType == opcua.DataType.Double) {
            let dvalue:number = dataValue.value.value;
            console.log(`>>>tag ${tags[x]} = ${dvalue}`);
        } else if (dataValue.value.dataType == opcua.DataType.Boolean) {
            let bvalue:boolean = dataValue.value.value;
            console.log(`>>>tag ${tags[x]} = ${bvalue}`);
        } else {
            console.log (">>>unexpected");
        }
    }
}

async function main()
{
    console.log ("Hello OPCUA!");

    // set up our list of tags we wish to gather data from

    let tags:string[] = [
        'E_STOP',
        'LIGHT_CURTAIN',
        'TEMPERATURE',
        'HUMIDITY',
        'CONVEYORSPEED'
    ];

    // create our OPC client and connect

    const opcClient = opcua.OPCUAClient.create (config.opc.connection);
        
    await opcClient.connect (config.opc.endpoint);
    console.log ("connected to OPC UA Server at: ", config.opc.endpoint);

    // create the session which will support subscriptions / monitoring

    let session = await opcClient.createSession();
    console.log("Session created.");

    const subscription = opcua.ClientSubscription.create(session, config.opc.subscription.parameters);
    console.log("Subscription created.");

    // manage the basic events issued by the subscription

    subscription.on("started", () => {
        console.log("Subscription started - subscriptionId=", subscription.subscriptionId);
    }).on("keepalive", () => {
        console.log("Subscription keepalive");
    }).on("terminated", () => {
        console.log("Subscription terminated");
    });


    // set up the details for the nodes we wish to monitor

    let x:number = 0;
    let items = [];

    for (x = 0; x < tags.length; x++) {
        let nodeID:string = "ns=1;s=" + tags[x];
        console.log (nodeID);
        items[x] = {
                "nodeId": nodeID,
                "parameters": {
                    "samplingInterval": 500,
                    "discardOldest": true,
                    "queueSize": 10
                },
            };
    }

    // set up the subscription to monitor changes to OPCUA data

    items.forEach((item) => {
        const monitoredItem = opcua.ClientMonitoredItem.create(
            subscription, {
                nodeId: item.nodeId,
                attributeId: opcua.AttributeIds.Value
            },
            item.parameters,
            opcua.TimestampsToReturn.Both
        );

        monitoredItem.on("changed", (dataValue: opcua.DataValue) => {
            let tagname:string = monitoredItem.itemToMonitor.nodeId.value.toString();
            handleDataReceived (tagname, dataValue);
        });
    });

    // set up a 1 second interval to read PLC tags

    setInterval (processReadRequest, 1000, tags, session);


    // support shutting down the connection if the microservice is terminated

    const shutdown = async() => {
        console.log ("disconnecting from OPC UA Server");
        await opcClient.disconnect();
        process.exit(0);
    }

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    console.log ("ready to run");
}


main();
