import * as config from './config.json';
import {DynalistApi} from 'dynalist-api';
const api = new DynalistApi(config.dynalistApiKey);
import moment = require('moment-timezone');

const weeklyTasksHashtag = "#todo-next-week";
const weekendTasksHashtag = "#todo-weekend";
const todayTasksHashTag = "#todo-today"; 

export const moveWeeklyTasks = async () => {
    //todo this is a reuable pattern, reuse it
    //if it's monday then move the tasks to today
    const momentWithTimezone = moment().tz("Europe/Zurich");//hard coded for now since the raspberry pi has a different timezone
    const isMonday = momentWithTimezone.day() === momentWithTimezone.day("Monday").day();
    if(!isMonday){
        return;
    }
    const documentId = config.dynalistTodoListDocumentId;
    const document = await api.getDocument(documentId) as any;

    //old
    // const nodes = document.nodes;
    // const weeklyNode = nodes.find(node => node.content.includes(weeklyTasksHashtag));
    // const todayNode = nodes.find(node => node.content.includes(todayTasksHashTag));
    // const subtrees = api.getSubTreesOrNull(weeklyNode, nodes);
    // if(subtrees){
    //     await api.copySubTrees(subtrees.children, todayNode.id, documentId, true);
    //     await api.deleteNodes(documentId, subtrees.children || []);
    // }
    //new
    const weeklyNode = document.getNodeByQuery(node => node.content.includes(weeklyTasksHashtag));
    const todayNode = document.getNodeByQuery(node => node.content.includes(todayTasksHashTag));
    weeklyNode.moveChildrenTo(todayNode);
}

export const moveWeekendTasks = async () => {
    const momentWithTimezone = moment().tz("Europe/Zurich");//hard coded for now since the raspberry pi has a different timezone
    const day = momentWithTimezone.day();
    const isWeekend = day === momentWithTimezone.day("Saturday").day() || day === momentWithTimezone.day("Sunday").day();
    if(!isWeekend){
        return;
    }
    const documentId = config.dynalistTodoListDocumentId;
    const document = await api.getDocument(documentId) as any;

    //old
    // const nodes = document.nodes;
    // const weekendNode = nodes.find(node => node.content.includes(weekendTasksHashtag));
    // const todayNode = nodes.find(node => node.content.includes(todayTasksHashTag));
    // const subtrees = api.getSubTreesOrNull(weekendNode, nodes);
    // if(subtrees){
    //     await api.copySubTrees(subtrees.children, todayNode.id, documentId, true);
    //     await api.deleteNodes(documentId, subtrees.children || []);
    // }
    //new
    const weekendNode = document.getNodeByQuery(node => node.content.includes(weekendTasksHashtag));
    const todayNode = document.getNodeByQuery(node => node.content.includes(todayTasksHashTag));
    weekendNode.moveChildrenTo(todayNode);
}