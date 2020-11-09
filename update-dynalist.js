const config = require('./config.json');
const request = require('request');
const path = require('path');
const _ = require('lodash');
const { LocalDate, ChronoUnit, Month, DateTimeFormatter } = require('js-joda');


const capitalizeFirstLetter = (s) => {
    if (typeof s !== 'string') return ''
    s = s.toLowerCase();
    return s.charAt(0).toUpperCase() + s.slice(1)
}

const getPostResponse = async (url, json) => {
    return new Promise((resolve, reject) => {
        request.post(
            {
                url: url,
                json: json
            },
            (error, res, body) => {
                if (!error && res.statusCode == 200) {
                    resolve(body);
                } else {
                    reject(error);
                }
            }
        );
    });
}

const runDynalistUpdates = async () => {
    const todoDocument = await getPostResponse('https://dynalist.io/api/v1/doc/read',
        {
            token: config.dynalistApiKey,
            file_id: "AXPTC35zVtBqlrn9sFmD1HhM"
        }
    );
    const nodes = todoDocument.nodes;
    var currentTodosIds = [];
    var tomorrowTodosIds = [];
    const allTodosNode = null;
    const allNodesPreUpdateCount = 0;
    _.forEach(nodes, node => {
        // if(node.checked){

        // }
        // else 
        if (node.id == config.dynalistTodoTodayId) {
            currentTodosIds = node.children || [];
        }
        else if (node.id == config.dynalistTodoTomorrowId) {
            tomorrowTodosIds = node.children || [];
            console.log(node.children);
        }
        // if(node.id == config.dynalistTodoAllId){
        //     allTodosNode = node;
        //     allNodesPreUpdateCount = node.children ? node.children.length : 0;
        // }
    });

    const todayAndTomorrow = currentTodosIds.concat(tomorrowTodosIds);
    console.log(todayAndTomorrow);
    const changes = [];

    var positionIndex = 0;
    _.forEach(todayAndTomorrow, nodeId => {
        console.log(nodeId);
        changes.push({
            "action": "move",
            "node_id": nodeId,
            "parent_id": config.dynalistTodoAllId,
            "index": positionIndex
        });
        positionIndex = positionIndex + 1;
    });

    const result = await getPostResponse('https://dynalist.io/api/v1/doc/edit',
        {
            token: config.dynalistApiKey,
            file_id: "AXPTC35zVtBqlrn9sFmD1HhM",
            changes: changes
        }
    );
    return result;
};

const ensureCorrectYearEntry = async (journalId, journalDocument, monthEntryId, newDate) => {
    const yearEntry = journalDocument.nodes.find(node => node.children && node.children.includes(monthEntryId));
    var yearEntryId = yearEntry.id;
    const newDateYear = newDate.year() + "";
    if (newDateYear !== yearEntry.content) {
        //todo do it the stupid polling way and then update it to do it more efficiently in less api calls
        const yearParentEntryId = journalDocument.nodes.find(node => node.children && node.children.includes(yearEntry.id)).id;
        const yearUpdateResult = await getPostResponse('https://dynalist.io/api/v1/doc/edit',
            {
                token: config.dynalistApiKey,
                file_id: journalId,
                changes: [{
                    "action": "insert",
                    "parent_id": yearParentEntryId,
                    "index": 0,
                    "content": newDateYear
                }]
            }
        );
        yearEntryId = yearUpdateResult.new_node_ids[0];
    }
    return yearEntryId;

}

const ensureCorrectMonthEntry = async (journalId, journalDocument, lastEntryId, newDate) => {
    const monthEntry = journalDocument.nodes.find(node => node.children && node.children.includes(lastEntryId));
    var monthEntryId = monthEntry.id;
    const yearEntryId = await ensureCorrectYearEntry(journalId, journalDocument, monthEntryId, newDate);
    const newDateMonthName = capitalizeFirstLetter(newDate.month().name());
    if (newDateMonthName !== monthEntry.content) {
        const monthUpdateResult = await getPostResponse('https://dynalist.io/api/v1/doc/edit',
            {
                token: config.dynalistApiKey,
                file_id: journalId,
                changes: [{
                    "action": "insert",
                    "parent_id": yearEntryId,
                    "index": 0,
                    "content": newDateMonthName
                }]
            }
        );
        monthEntryId = monthUpdateResult.new_node_ids[0];
    }
    return monthEntryId;
}

const getDocument = async (id) => {
    const document = await getPostResponse('https://dynalist.io/api/v1/doc/read',
    {
        token: config.dynalistApiKey,
        file_id: id
    });
    return document;
}

const createNewEntry = async (fileId, parentId, content, index=0) => {
    await getPostResponse('https://dynalist.io/api/v1/doc/edit',
            {
                token: config.dynalistApiKey,
                file_id: fileId,
                changes: [{
                    "action": "insert",
                    "parent_id": parentId,
                    "index": index,
                    "content": content
                }]
            }
    );
}

const updateOldEntry = async (fileId, id, content) => {
    await getPostResponse('https://dynalist.io/api/v1/doc/edit',
            {
                token: config.dynalistApiKey,
                file_id: fileId,
                changes: [{
                    "action": "edit",
                    "node_id": id,
                    "content": content
                }]
            }
    );
}

const padDateNumWithZeros = (numString) => numString.length === 1 ? ("0" + numString) : numString

const createJournalEntries = async () => {
    const journalId = config.journalDocumentId;
    var journalDocument = await getDocument(journalId);
    console.log(journalDocument);
    var lastEntry = journalDocument.nodes.find(node => node.content.includes("#latest"));
    if (lastEntry == null) {
        throw Error("there is no latest element");
    }
    var re = /!\((.*)\)/i;
    var currentDateString = lastEntry.content.match(re)[1];
    var newDate = LocalDate.parse(currentDateString);
    const today = LocalDate.now();
    const daysDifference = newDate.until(today, ChronoUnit.DAYS);
    var parentEntry = journalDocument.nodes.find(node => node.children && node.children.includes(lastEntry.id));
    if (parentEntry == null) {
        throw Error("latest element not found in journal tree");
    }
    for (var i = 0; i < daysDifference; i++) {
        newDate = newDate.plusDays(1);
        //todo don't pass in the journal document, just the month and year
        const monthEntryId = await ensureCorrectMonthEntry(journalId, journalDocument, lastEntry.id, newDate);
        const oldEntryContent = lastEntry.content.replace(" #latest", "");
        await updateOldEntry(journalId, lastEntry.id, oldEntryContent)
        const month = padDateNumWithZeros(newDate.month().value().toString());
        const day = padDateNumWithZeros(newDate.dayOfMonth().toString());
        const newEntryContent = `!(${newDate.year()}-${month}-${day}) #latest`
        await createNewEntry(journalId, monthEntryId, newEntryContent)
        journalDocument = await getDocument(journalId);   
        lastEntry = journalDocument.nodes.find(node => node.content.includes("#latest"));    
    }
}

createJournalEntries();

runDynalistUpdates();