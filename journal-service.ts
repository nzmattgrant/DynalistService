import * as DateUtils from './date-utils';
import * as config from './config.json';
import * as DynalistService from './dynalist-service';
import { LocalDate, ChronoUnit, nativeJs } from 'js-joda';
import {DynalistApi} from 'dynalist-api';

const api = new DynalistApi(config.dynalistApiKey);

const testfunc = () => {
    console.log("testy test");
}

const capitalizeFirstLetter = (s) => {
    if (typeof s !== 'string') return ''
    s = s.toLowerCase();
    testfunc();
    return s.charAt(0).toUpperCase() + s.slice(1);

}

const updateOldEntry = async (fileId: string, id: any, content: any) => {
    await api.updateDocument(fileId, [{
        "action": "edit",
        "node_id": id,
        "content": content
    }]);
}

const ensureCorrectYearEntry = async (journalId, journalDocument, monthEntryId, newDate) => {
    const yearEntry = journalDocument.nodes.find(node => node.children && node.children.includes(monthEntryId));
    var yearEntryId = yearEntry.id;
    const newDateYear = newDate.year() + "";
    if (newDateYear !== yearEntry.content) {
        //todo do it the stupid polling way and then update it to do it more efficiently in less api calls
        const yearParentEntryId = journalDocument.nodes.find(node => node.children && node.children.includes(yearEntry.id)).id;
        const yearUpdateResult = await DynalistService.updateDocument(journalId, [{
            "action": "insert",
            "parent_id": yearParentEntryId,
            "index": 0,
            "content": newDateYear
        }]);
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
        const monthUpdateResult = await DynalistService.updateDocument(journalId, 
            [{
                "action": "insert",
                "parent_id": yearEntryId,
                "index": 0,
                "content": newDateMonthName
            }]
        );
        monthEntryId = monthUpdateResult.new_node_ids[0];
    }
    return monthEntryId;
}

const padDateNumWithZeros = (numString) => numString.length === 1 ? ("0" + numString) : numString;

export const createJournalEntries = async () => {
    const journalId = config.journalDocumentId;
    var journalDocument = await DynalistService.getDocument(journalId);
    console.log(journalDocument);
    var lastEntry = journalDocument.nodes.find(node => node.content.includes(config.todayTag));
    var previousEntry = journalDocument.nodes.find(node => node.content.includes(config.yesterdayTag));
    if (lastEntry == null) {
        throw Error("there is no latest element");
    }
    if (previousEntry == null) {
        throw Error("there is no previous element");
    }
    //todo switch over from js-joda to momentjs (moment is more convenient)
    var newDate = LocalDate.from(nativeJs(DateUtils.getDateFromDynalistNote(lastEntry.content)));
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
        const oldLastEntryContent = lastEntry.content.replace(config.todayTag, config.yesterdayTag);
        await updateOldEntry(journalId, lastEntry.id, oldLastEntryContent);
        const oldPreviousEntryContent = previousEntry.content.replace(" " + config.yesterdayTag, "");
        await updateOldEntry(journalId, previousEntry.id, oldPreviousEntryContent);
        const month = padDateNumWithZeros(newDate.month().value().toString());
        const day = padDateNumWithZeros(newDate.dayOfMonth().toString());
        const newEntryContent = `!(${newDate.year()}-${month}-${day}) ${config.todayTag}`
        await DynalistService.createNewEntry(journalId, monthEntryId, newEntryContent)
        journalDocument = await DynalistService.getDocument(journalId);
        lastEntry = journalDocument.nodes.find(node => node.content.includes(config.todayTag));
        previousEntry = journalDocument.nodes.find(node => node.content.includes(config.yesterdayTag));
    }
}