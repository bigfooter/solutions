﻿// ------------------------ Application -------------------

function OnApplicationInit() {
	SetSessionConstants();
	Indicators.SetIndicators();
}

// ------------------------ Events ------------------------

function OnLoad(screenName) {
	if (screenName == "Outlet_Map.xml") {
		var outlet = Variables["outlet"];
		Variables["map"].AddMarker(outlet.Description, outlet.Lattitude,
				outlet.Longitude, "red");
	} else if (screenName == "ScheduledVisits_Map.xml") {
		PrepareScheduledVisits_Map();
	}
}

function OnWorkflowStart(name) {
	if ($.Exists("workflow"))
		$.Remove("workflow");
	Variables.AddGlobal("workflow", new Dictionary());
	if (name == "Visits" || name == "Outlets" || name=="CreateOrder") {
		GPS.StartTracking();
	}

	if (name == "Visit") {
		
			var questionnaires = GetQuestionnairesForOutlet($.outlet);

			if (parseInt(GetTasksCount()) != parseInt(0))
				$.workflow.Add("skipTasks", false); // нельзя просто
															// взять и присвоить
															// значение
															// переменной!
			else
				$.workflow.Add("skipTasks", true);

			if (parseInt(GetQuestionsCount()) != parseInt(0))
				$.workflow.Add("skipQuestions", false);
			else
				$.workflow.Add("skipQuestions", true);

			if (parseInt(GetSKUQuestionsCount()) != parseInt(0)) 
				$.workflow.Add("skipSKUs", false);
			else
				$.workflow.Add("skipSKUs", true);
	}
	
	
	Variables["workflow"].Add("name", name);

}

function OnWorkflowForward(name, lastStep, nextStep, parameters) {
	if (lastStep == "Order" && nextStep == "EditSKU"
			&& Variables.Exists("AlreadyAdded") == false) {
		Variables.AddGlobal("AlreadyAdded", true);
	}
}

function OnWorkflowForwarding(workflowName, lastStep, nextStep, parameters) {

	if (workflowName == "Visit") {

		if (nextStep == "Visit_Tasks") {
			if ($.workflow.skipTasks) {
				if ($.workflow.skipQuestions) {
					if ($.workflow.skipSKUs) {
						Workflow.Action("Skip3", [ outlet ]);
						return false;
					}
					Workflow.Action("Skip2", []);
					return false;
				}
				Workflow.Action("Skip1", []);
				return false;
			}
		}

		if (nextStep == "Questions") {
			if ($.workflow.skipQuestions) {
				if ($.workflow.skipSKUs) {
					Workflow.Action("Skip3", [ outlet ]);
					return false;
				}
				Workflow.Action("Skip2", []);
				return false;
			} else
				Workflow.Action("Skip1", []);
		}

		if (nextStep == "SKUs") {
			if ($.workflow.skipSKUs) {
				Workflow.Action("Skip3", [ outlet ]);
				return false;
			} else
				Workflow.Action("Skip2", []);
		}
	}

	return true;

}

//function OnWorkflowBack(name, lastStep, nextStep) {}

function OnWorkflowFinish(name, reason) {
	$.Remove("finishedWorkflow");
	$.AddGlobal("finishedWorkflow", name);
	
	if (name == "Visit" || name == "CreateOrder" || name=="Outlets") {
		Variables.Remove("outlet");

		if (Variables.Exists("planVisit"))
			Variables.Remove("planVisit");
		if (Variables.Exists("steps"))
			Variables.Remove("steps");

		GPS.StopTracking();
	}

	Variables.Remove("workflow");

	if (Variables.Exists("group_filter"))
		Variables.Remove("group_filter");

	if (Variables.Exists("brand_filter"))
		Variables.Remove("brand_filter");
	
	if (name=="Visit" || name=="CreateOrder" || name=="Outlets")
		Indicators.SetIndicators();
	
}

function OnWorkflowPause(name) {
	Variables.Remove("workflow");
}

// ------------------------ Functions ------------------------

function SetSessionConstants() { 
	var planEnbl = new Query("SELECT Use FROM Catalog_MobileApplicationSettings WHERE Code='PlanEnbl'");
	var multStck = new Query("SELECT Use FROM Catalog_MobileApplicationSettings WHERE Code='MultStck'");
	var stckEnbl = new Query("SELECT Use FROM Catalog_MobileApplicationSettings WHERE Code='NoStkEnbl'");
	
	$.AddGlobal("sessionConst", new Dictionary());
	$.sessionConst.Add("PlanEnbl", EvaluateBoolean(planEnbl.ExecuteScalar()));
	$.sessionConst.Add("MultStck", EvaluateBoolean(multStck.ExecuteScalar()));
	$.sessionConst.Add("NoStkEnbl", EvaluateBoolean(stckEnbl.ExecuteScalar()));
}

function EvaluateBoolean(res){
	if (res == null)
		return false;
	else {
		if (parseInt(res) == parseInt(0))
			return false
		else
			return true;
	}
}

function PrepareScheduledVisits_Map() {
	var visitPlans = Variables["visitPlans"];
	for ( var visitPlan in visitPlans) {
		var outlet = DB.Current.Catalog.Outlet.SelectBy("Id", visitPlan)
				.First();
		if (!isDefault(outlet.Lattitude) && !isDefault(outlet.Longitude)) {
			var query = new Query();
			query.AddParameter("Date", DateTime.Now.Date);
			query.AddParameter("Outlet", outlet.Id);
			query.Text = "select single(*) from Document.Visit where Date.Date == @Date && Outlet==@Outlet";
			var result = query.Execute();
			if (result == null)
				Variables["map"].AddMarker(outlet.Description,
						outlet.Lattitude, outlet.Longitude, "yellow");
			else
				Variables["map"].AddMarker(outlet.Description,
						outlet.Lattitude, outlet.Longitude, "green");
		}
	}
}

function GetTasksCount() {
	var taskQuery = new Query("SELECT COUNT(Id) FROM Document_Task WHERE PlanDate >= date('now','start of day') AND Outlet=@outlet");
	taskQuery.AddParameter("outlet", $.outlet);
	return taskQuery.ExecuteScalar();
}

function GetQuestionnairesForOutlet(outlet) {
	var query = new Query("SELECT DISTINCT Q.Id " +//, ST.Selector, ST.ComparisonType, ST.Value, ST.AdditionalParameter " +
			"FROM Document_Questionnaire_Schedule S " +
			"JOIN Document_Questionnaire Q ON Q.Id=S.Ref " +
			//"JOIN Document_Questionnaire_Selectors ST ON ST.Ref=Q.Id " +
			"WHERE date(S.Date)=date('now', 'start of day') ORDER BY Q.Id");//, ST.Selector, ST.ComparisonType");
	var recordset = query.Execute();

	var list = new List;
	var actualQuestionnaire = true;
	var currentQuestionnaire;
	
	while (recordset.Next()) {		
		
		var query1 = new Query("SELECT Selector, ComparisonType, Value, AdditionalParameter, Ref " +
				"FROM Document_Questionnaire_Selectors WHERE Ref=@ref ORDER BY Selector, ComparisonType");
		query1.AddParameter("ref",recordset.Id);
		var selectors = query1.Execute();
		
		var listParameter = new List;	//
		var listChecked = true;			//stuff for
		var currentSelector=null;		//list selector
		var currentParam = null;				//
		
		while (selectors.Next() && actualQuestionnaire) {				
				
			Dialog.Debug(currentSelector!=null);
			Dialog.Debug(currentSelector!=selectors.Selector);
			if (currentSelector!=null && currentSelector!=selectors.Selector){ //it's time to check list selector
				Dialog.Debug("checking list");
				actualQuestionnaire = CheckListSelector(listParameter);
				Dialog.Debug("returned list check");
				Dialog.Debug(actualQuestionnaire);
				if (actualQuestionnaire==false){
					break;
				}
				listParameter = new List;
				listChecked = true;
			}
			
			if (selectors.ComparisonType=="In list" || selectors.ComparisonType=="В списке"){								
				listParameter.Add(CheckSelector(outlet, selectors.Selector, "Equal", selectors.Value)); //real check is later, now - only an array
				Dialog.Debug(listParameter);
				listChecked = false;
				currentSelector = selectors.Selector;			//stuff for
				currentParam = selectors.AdditionalParameter;	//list selectors, again
			}
			else{
				actualQuestionnaire = CheckSelector(outlet, selectors.Selector, selectors.ComparisonType, selectors.Value);
				currentSelector = null;
				currentParam = null;
			}						
			
		}
		
		if (listChecked==false){ //one more time try to check list if it's hasn't been done in loop
			actualQuestionnaire = CheckListSelector(listParameter);
		}
		
		if (actualQuestionnaire) //this is what it's all for
			list.Add(recordset.Id);
		
		actualQuestionnaire = true;
	}

	Dialog.Debug(list);
	return list;
			
}

function NewList() {
	var l = new List;
	return l;
}

function CheckSelector(outlet, selector, compType, value) {
	if (selector=="Catalog_OutletType"){
		Dialog.Debug("1");
		if ((outlet.Type).ToString()==("@ref[Catalog_OutletType]:" + value))
			return Compare(compType, true);
		else
			return Compare(compType, false);
	}
	if (selector=="Catalog_OutletClass"){
		Dialog.Debug("2");
		// Dialog.Debug((outlet.Class).ToString());
		if ((outlet.Class).ToString()==("@ref[Catalog_OutletClass]:" + value))
			return Compare(compType, true);
		else
			return Compare(compType, false);
	}

	if (selector=="Enum_OutletStatus"){
		Dialog.Debug("4");
		// Dialog.Debug((outlet.Class).ToString());
		if ((outlet.OutletStatus).ToString()==("@ref[Enum_OutletStatus]:" + value))
			return Compare(compType, true);
		else
			return Compare(compType, false);
	}
	
	if (selector=="Catalog_Distributor"){
		Dialog.Debug("5");
		if ((outlet.Distributor).ToString()==("@ref[Catalog_Distributor]:" + value))
			return Compare(compType, true);
		else
			return Compare(compType, false);
	}
	
	if (selector=="Catalog_Outlet"){
		Dialog.Debug("6");
		if ((outlet.Id).ToString()==(value)){
			return Compare(compType, true);
		}
		else{
			return Compare(compType, false);
		}			
	}
	
	if (selector=="Catalog_Territory"){
		Dialog.Debug("7");
		var query = new Query("SELECT Id FROM Catalog_Territory_Outlets WHERE Outlet=@outlet AND Ref=@ref")
		query.AddParameter("outlet", outlet);
		query.AddParameter("ref", ("@ref[Catalog_Territory]:" + value));
		var result = query.ExecuteScalar();		
		if (result!=null)
			return Compare(compType, true);
		else
			return Compare(compType, false);
	}
	
	if (selector=="Catalog_Region"){
		Dialog.Debug("8");
		var query = new Query("WITH Regions(Id) AS " +
				"(SELECT e.Id FROM Catalog.Region AS e WHERE e.Id = @region " +
				"UNION All SELECT e.Id FROM Catalog.Region AS e " +
				"JOIN Regions AS d ON e.Parent = d.Id) " +
				"SELECT O.Id from Regions JOIN Catalog.Territory t ON t.Owner = Regions.Id " +
				"JOIN Catalog.Territory_Outlets o ON o.Ref = t.Id AND o.Outlet = @outlet");
		query.AddParameter("outlet", outlet);
		query.AddParameter("region", "@ref[Catalog_Region]:" + value);
		var result = query.ExecuteScalar();		
		if (result!=null)
			return Compare(compType, true);
		else
			return Compare(compType, false);
	}
	
	if (selector=="Catalog_OutletParameter"){
		Dialog.Debug("9");
		var query = new Query("SELECT Id FROM Catalog_OutletParameters WHERE Ref=@ref AND Value=@value");
		query.AddParameter("ref", outlet);
		query.AddParemeter("value", value);
		if (query.ExecuteScalar()!=null)
			return Compare(compType, true);
		else
			return Compare(compType, false);
	}
	
	if (selector==null){
		Dialog.Debug("3");
		return false;
	}	

}

function Compare(compType, equal) {
	if (compType=="Not equal" || compType=="Не равно"){
		if (equal)
			return false;
		else
			return true;
	}
	else{
		if (equal)
			return true;
		else
			return false;
	}
}

function CheckListSelector(list) {
	Dialog.Debug("before check loop");
	Dialog.Debug(list);
	for (var item in list) {
		Dialog.Debug(item);
		if (item){
			Dialog.Debug("true item");
			return true;
		}
	}
	return false;
}

function GetQuestionsCount() {
	return 1;
}

function GetSKUQuestionsCount() {	
	return 1;
}

function DeleteFromList(item, collection) {
    var list = new List;
    for (var i in collection) {
        if (item.ToString() != i.ToString())
            list.Add(i);
    }
    return list;
}
