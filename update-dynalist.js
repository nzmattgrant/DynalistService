const config = require('./config.json');
const request = require('request');
const path = require('path');
const _ = require('lodash');
const { LocalDate, ChronoUnit, Month, DateTimeFormatter } = require('js-joda');
const moment = require("moment");


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

    var todoDocument = await getPostResponse('https://dynalist.io/api/v1/doc/read',
        {
            token: config.dynalistApiKey,
            file_id: config.dynalistTodoListDocumentId
        }
    );
    var nodes = todoDocument.nodes;
    //var currentTodosIds = [];
    var tomorrowTodosIds = [];
    var futureTodosIds = [];
    _.forEach(nodes, node => {
        if (node.id == config.dynalistTodoTodayId) {
            currentTodosIds = node.children || [];
        }
        else if (node.id == config.dynalistTodoTomorrowId) {
            tomorrowTodosIds = node.children || [];
        }
        if (node.id == config.dynalistTodoAllId) {
            futureTodosIds = node.children || [];
        }
    });

    var changes = [];

    var positionIndex = 0;
    _.forEach(tomorrowTodosIds, nodeId => {
        console.log(nodeId);
        changes.push({
            "action": "move",
            "node_id": nodeId,
            "parent_id": config.dynalistTodoTodayId,
            "index": positionIndex
        });
        positionIndex = positionIndex + 1;
    });

    var futureTodos = nodes.filter(n => futureTodosIds.includes(n.id));

    const now = moment();
    positionIndex = 0;
    _.forEach(futureTodos, node => {
        if (now.diff(moment(node.modified), "days") > 7) {
            changes.push({
                "action": "move",
                "node_id": node.id,
                "parent_id": config.dynalistTodoTodayId,
                "index": positionIndex
            });
            positionIndex = positionIndex + 1;
        }
    });

    await getPostResponse('https://dynalist.io/api/v1/doc/edit',
        {
            token: config.dynalistApiKey,
            file_id: config.dynalistTodoListDocumentId,
            changes: changes
        }
    );

    //todo split these out into diffent files
    changes = [];

    //todo split this into a function
    todoDocument = await getPostResponse('https://dynalist.io/api/v1/doc/read',
        {
            token: config.dynalistApiKey,
            file_id: config.dynalistTodoListDocumentId
        }
    );
    nodes = todoDocument.nodes;
    var currentTodos = [];
    var futureTodos = [];
    _.forEach(nodes, node => {
        if (node.id == config.dynalistTodoTodayId) {
            currentTodos = nodes.filter(n => node.children.includes(n.id)) || [];
        }
        if (node.id == config.dynalistTodoAllId) {
            futureTodos = nodes.filter(n => node.children.includes(n.id)) || [];
        }
    });

    currentTodos = currentTodos.sort((a, b) => (a.color || 4) - (b.color || 4))

    positionIndex = 0;
    _.forEach(currentTodos, node => {
        changes.push({
            "action": "move",
            "node_id": node.id,
            "parent_id": config.dynalistTodoTodayId,
            "index": positionIndex
        });
        positionIndex = positionIndex + 1;
    });

    futureTodos = futureTodos.sort((a, b) => (a.color || 4) - (b.color || 4))

    positionIndex = 0;
    _.forEach(futureTodos, node => {
        changes.push({
            "action": "move",
            "node_id": node.id,
            "parent_id": config.dynalistTodoAllId,
            "index": positionIndex
        });
        positionIndex = positionIndex + 1;
    });

    await getPostResponse('https://dynalist.io/api/v1/doc/edit',
        {
            token: config.dynalistApiKey,
            file_id: config.dynalistTodoListDocumentId,
            changes: changes
        }
    );
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

const createNewEntry = async (fileId, parentId, content, index = 0) => {
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

const getSubTreesOrNull = (item, nodes) => {
    const subTrees = [];
    if (item.children) {
        const childrenItems = nodes.filter(node => item.children.includes(node.id))
        childrenItems.forEach(childItem => {
            const childAsSubtrees = getSubTreesOrNull(childItem, nodes);
            if (childAsSubtrees != null) {
                subTrees.push(childAsSubtrees)
            }
        });
    }
    if (item.checked || subTrees.length) {
        return {
            id: item.id,
            content: item.content,
            checked: item.checked || false,
            children: subTrees
        };
    }
    return null;
}

const getPreprocessChanges = async (item, nodes, parentChecked = false) => {
    var changes = [];
    if (item.children) {
        const childrenItems = nodes.filter(node => item.children.includes(node.id))
        for (childItem of childrenItems) {
            const nextChanges = await getPreprocessChanges(childItem, nodes, parentChecked || item.checked);
            changes = changes.concat(nextChanges)
        }
    }
    if (parentChecked && !item.checked) {
        changes.push({
            "action": "edit",
            "node_id": item.id,
            "checked": true,
            "content": item.content
        });
    }
    return changes;
}

const updateDocument = async (documentId, changes) => {
    return await getPostResponse('https://dynalist.io/api/v1/doc/edit',
        {
            token: config.dynalistApiKey,
            file_id: documentId,
            changes: changes
        });
}

const preprocessSubTrees = async (item, nodes) => {
    const changes = await getPreprocessChanges(item, nodes);
    if (changes.length) {
        await updateDocument(config.dynalistTodoListDocumentId, changes);
        console.log("here");
    }
}

var count = 0;

const copyCheckedSubTrees = async (subTrees, parentId) => {
    if (!subTrees || !subTrees.length) {
        return [];
    }
    var copiedIds = [];
    var changes = [];
    subTrees.forEach((item, i) => {
        count = count + 1;
        changes.push({
            "action": "insert",
            "parent_id": parentId,
            "index": i,
            "content": item.content
        });
        copiedIds.push(item.id);
        if(item.id === undefined){
            console.log(item);
        }
    });
    var result = await updateDocument(config.journalDocumentId, changes);
    //await delay(1000);
    var newIds = result.new_node_ids || [];
    //Assumption is that everything is in the same order as what they were passed in as
    //If not it's really annoying
    for (var i = 0; i < subTrees.length; i++) {
        const copiedChildIds = await copyCheckedSubTrees(subTrees[i].children || [], newIds[i]);
        copiedIds = copiedIds.concat(copiedChildIds);
    }
    return copiedIds;
}

const getCheckedItemDeleteChanges = (subTrees, okToDelete) => {
    var changes = [];
    for (item of subTrees) {
        if (item.children) {
            const nextChanges = getCheckedItemDeleteChanges(item.children, okToDelete);
            changes = changes.concat(nextChanges)
        }
        if (item.checked && okToDelete.includes(item.id)) {
            changes.push({
                "action": "delete",
                "node_id": item.id,
            });
        }
    }
    return changes;
}

const delay = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const moveCheckedSubTrees = async (subTrees, parentId) => {
    const copiedIds = await copyCheckedSubTrees(subTrees, parentId);
    //avoid rate limiting
    //await delay(30000);
    const changes = getCheckedItemDeleteChanges(subTrees, copiedIds);
    console.log(count);
    const result = await updateDocument(config.dynalistTodoListDocumentId, changes);
    console.log(result);
}

const archiveCompletedTodos = async () => {
    const document = await getDocument(config.dynalistTodoListDocumentId);
    const nodes = document.nodes;
    const todayTodoEntry = nodes.find(item => item.id == config.dynalistTodoTodayId);
    await preprocessSubTrees(todayTodoEntry, nodes);
    await delay(10000);
    var subTrees = getSubTreesOrNull(todayTodoEntry, nodes);
    subTrees = subTrees && subTrees.children ? subTrees.children : [];
    const journalDocument = await getDocument(config.journalDocumentId);
    const journalNodes = journalDocument.nodes;
    const todayJournalEntry = journalNodes.find(node => node.content.includes("#latest"));
    await moveCheckedSubTrees(subTrees, todayJournalEntry.id);
    //await delay(10000);
}

(async () => {
    //try to avoid rate limiting with the delay
    await createJournalEntries();
    //await delay(10000);

    //await archiveCompletedTodos();
    //await delay(10000);

    await runDynalistUpdates();

    console.log("done");
})();


