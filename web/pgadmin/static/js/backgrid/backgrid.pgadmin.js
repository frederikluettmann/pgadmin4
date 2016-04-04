(function(root, factory) {
  // Set up Backform appropriately for the environment. Start with AMD.
  if (typeof define === 'function' && define.amd) {
    define(['underscore', 'jquery', 'backbone', 'backform', 'backgrid', 'alertify'],
     function(_, $, Backbone, Backform, Backgrid, Alertify) {
      // Export global even in AMD case in case this script is loaded with
      // others that may still expect a global Backform.
      return factory(root, _, $, Backbone, Backform, Alertify);
    });

  // Next for Node.js or CommonJS. jQuery may not be needed as a module.
  } else if (typeof exports !== 'undefined') {
    var _ = require('underscore') || root._,
      $ = root.jQuery || root.$ || root.Zepto || root.ender,
      Backbone = require('backbone') || root.Backbone,
      Backform = require('backform') || root.Backform;
      Alertify = require('alertify') || root.Alertify;
    factory(root, _, $, Backbone, Backform, Alertify);

  // Finally, as a browser global.
  } else {
    factory(root, root._, (root.jQuery || root.Zepto || root.ender || root.$), root.Backbone, root.Backform);
  }
} (this, function(root, _, $, Backbone, Backform, Alertify) {

  /*
     * Add mechanism in backgrid to render different types of cells in
     * same column;
   */

  // Add new property cellFunction in Backgrid.Column.
  _.extend(Backgrid.Column.prototype.defaults, { cellFunction: undefined });

  _.extend(Backgrid.Row.prototype, {
    makeCell: function (column) {
      return new (this.getCell(column))({
        column: column,
        model: this.model
      });
    },
    /*
     * getCell function will check and execute user given cellFunction to get
     * appropriate cell class for current cell being rendered.
     * User provided cellFunction must return valid cell class.
     * cellFunction will be called with context (this) as column and model as
     * argument.
     */
    getCell: function (column) {
      var cf = column.get("cellFunction");
      if (_.isFunction(cf)){
        var cell = cf.apply(column, [this.model]);
        try {
          return Backgrid.resolveNameToClass(cell, "Cell");
        } catch (e) {
          if (e instanceof ReferenceError) {
            // Fallback to column cell.
            return column.get("cell");
          } else {
            throw e; // Let other exceptions bubble up
          }
        }
      } else {
        return column.get("cell");
      }
    }
  });

  var ObjectCellEditor = Backgrid.Extension.ObjectCellEditor = Backgrid.CellEditor.extend({
    modalTemplate: _.template([
      '<div class="subnode-dialog" tabindex="1">',
      '    <div class="subnode-body"></div>',
      '</div>'
    ].join("\n")),
    stringTemplate: _.template([
      '<div class="form-group">',
      '  <label class="control-label col-sm-4"><%=label%></label>',
      '  <div class="col-sm-8">',
      '    <input type="text" class="form-control" name="<%=name%>" value="<%=value%>" placeholder="<%=placeholder%>" />',
      '  </div>',
      '</div>'
    ].join("\n")),
    extendWithOptions: function(options) {
      _.extend(this, options);
    },
    render: function () {
      return this;
    },
    postRender: function(model, column) {
      var editor = this,
          el = this.el;
          columns_length = this.columns_length;

      if (column != null && column.get("name") != this.column.get("name"))
        return false;

      if (!_.isArray(this.schema)) throw new TypeError("schema must be an array");

      // Create a Backbone model from our object if it does not exist
      var $dialog = this.createDialog(columns_length);

      // Add the Bootstrap form
      var $form = $('<form class="form-dialog"></form>');
      $dialog.find('div.subnode-body').append($form);

      // Call Backform to prepare dialog
      back_el = $dialog.find('form.form-dialog');

      this.objectView = new Backform.Dialog({
        el: back_el, model: this.model, schema: this.schema,
        tabPanelClassName: function() {
          return 'sub-node-form col-sm-12';
        }
      });

      this.objectView.render();

      return this;
    },
    createDialog: function(noofcol) {
      var $dialog = this.$dialog = $(this.modalTemplate({title: ""})),
          tr = $("<tr>"),
          noofcol = noofcol || 1,
          td = $("<td>", {class: 'editable sortable renderable', style: 'height: auto', colspan: noofcol+2}).appendTo(tr);

      this.tr = tr;

      // Show the Bootstrap modal dialog
      td.append($dialog.css('display', 'block'));
      this.el.parent('tr').after(tr);

      return $dialog;
    },
    save: function() {
      // Retrieve values from the form, and store inside the object model
      this.model.trigger("backgrid:edited", this.model, this.column, new Backgrid.Command({keyCode:13}));
      if (this.tr) {
        this.tr.remove();
      }

      return this;
    },
    remove: function() {
      this.$dialog.modal("hide").remove();
      Backgrid.CellEditor.prototype.remove.apply(this, arguments);
      if (this.tr) {
        this.tr.remove();
      }
      return this;
    }
  });

  var PGSelectCell = Backgrid.Extension.PGSelectCell = Backgrid.SelectCell.extend({
    // It's possible to render an option group or use a
    // function to provide option values too.
    optionValues: function() {
      var res = [];
          opts = _.result(this.column.attributes, 'options');
      _.each(opts, function(o) {
        res.push([o.label, o.value]);
      });
      return res;
    }
  });

  var ObjectCell = Backgrid.Extension.ObjectCell = Backgrid.Cell.extend({
    editorOptionDefaults: {
      schema: []
    },
    className: "edit-cell",
    editor: ObjectCellEditor,
    initialize: function(options) {
      Backgrid.Cell.prototype.initialize.apply(this, arguments);

      // Pass on cell options to the editor
      var cell = this,
          editorOptions = {};
      _.each(this.editorOptionDefaults, function(def, opt) {
        if (!cell[opt]) cell[opt] = def;
        if (options && options[opt]) cell[opt] = options[opt];
        editorOptions[opt] = cell[opt];
      });

      editorOptions['el'] = $(this.el);
      editorOptions['columns_length'] = this.column.collection.length;
      editorOptions['el'].attr('tabindex' , 1);

      this.listenTo(this.model, "backgrid:edit", function (model, column, cell, editor) {
        if (column.get("name") == this.column.get("name"))
          editor.extendWithOptions(editorOptions);
      });
    },
    enterEditMode: function () {
      // Notify that we are about to enter in edit mode for current cell.
      this.model.trigger("enteringEditMode", [this]);

      Backgrid.Cell.prototype.enterEditMode.apply(this, arguments);
      /* Make sure - we listen to the click event */
      this.delegateEvents();
      var editable = Backgrid.callByNeed(this.column.editable(), this.column, this.model);
      if (editable) {
        this.$el.html(
          "<i class='fa fa-pencil-square subnode-edit-in-process'></i>"
          );
        this.model.trigger(
          "pg-sub-node:opened", this.model, this
          );
      }
    },
    render: function(){
        this.$el.empty();
        this.$el.html("<i class='fa fa-pencil-square-o'></i>");
        this.delegateEvents();
        if (this.grabFocus)
          this.$el.focus();
        return this;
    },
    exitEditMode: function() {
      var index = $(this.currentEditor.objectView.el)
        .find('.nav-tabs > .active > a[data-toggle="tab"]').first()
        .data('tabIndex');
      Backgrid.Cell.prototype.exitEditMode.apply(this, arguments);
      this.model.trigger(
          "pg-sub-node:closed", this, index
          );
      this.grabFocus = true;
    },
    events: {
      'click': function(e) {
        if (this.$el.find('i').first().hasClass('subnode-edit-in-process')) {
          // Need to redundantly undelegate events for Firefox
          this.undelegateEvents();
          this.currentEditor.save();
        } else {
          this.enterEditMode.call(this, []);
        }
        e.preventDefault();
      }
    }
  });

  var DeleteCell = Backgrid.Extension.DeleteCell = Backgrid.Cell.extend({
      /** @property */
      className: "delete-cell",
      events: {
        "click": "deleteRow"
      },
      deleteRow: function (e) {
        e.preventDefault();
        that = this;
        Alertify.confirm(
            'Delete Row',
            'Are you sure you wish to delete this row?',
            function(evt) {
              that.model.collection.remove(that.model);
            },
            function(evt) {
              return true;
            }
          );
      },
      initialize: function () {
          Backgrid.Cell.prototype.initialize.apply(this, arguments);
      },
      render: function () {
          this.$el.empty();
          this.$el.html("<i class='fa fa-trash'></i>");
          this.delegateEvents();
          return this;
      }
  });

  var CustomHeaderCell = Backgrid.Extension.CustomHeaderCell = Backgrid.HeaderCell.extend({
    initialize: function () {
      // Here, we will add custom classes to header cell
      Backgrid.HeaderCell.prototype.initialize.apply(this, arguments);
      var getClassName = this.column.get('cellHeaderClasses');
      if (getClassName) {
        this.$el.addClass(getClassName);
      }
    }
  });

  /**
    SwitchCell renders a Bootstrap Switch in backgrid cell
  */
  var SwitchCell = Backgrid.Extension.SwitchCell = Backgrid.BooleanCell.extend({
    defaults: {
      options: _.defaults({
        onText: 'True',
        offText: 'False',
        onColor: 'success',
        offColor: 'default',
        size: 'mini'
        }, $.fn.bootstrapSwitch.defaults)
    },
    className: 'switch-cell',
    events: {
      'switchChange.bootstrapSwitch': 'onChange'
    },
    onChange: function () {
      var model = this.model,
          column = this.column,
          val = this.formatter.toRaw(this.$input.prop('checked'), model);

      // on bootstrap change we also need to change model's value
      model.set(column.get("name"), val);
    },
    render: function () {
      var col = _.defaults(this.column.toJSON(), this.defaults),
          attributes = this.model.toJSON(),
          attrArr = col.name.split('.'),
          name = attrArr.shift(),
          path = attrArr.join('.'),
          model = this.model, column = this.column,
          rawValue = this.formatter.fromRaw(
            model.get(column.get("name")), model
          ),
          editable = Backgrid.callByNeed(col.editable, column, model);

      this.$el.empty();
      this.$el.append(
        $("<input>", {
          tabIndex: -1,
          type: "checkbox"
          }).prop('checked', rawValue).prop('disabled', !editable));
      this.$input = this.$el.find('input[type=checkbox]').first();

      // Override BooleanCell checkbox with Bootstrapswitch
      this.$input.bootstrapSwitch(
        _.defaults(
          {'state': rawValue, 'disabled': !editable}, col.options,
          this.defaults.options
          ));

      this.delegateEvents();

      return this;
    }
  });

  /**
    Select2CellEditor the cell editor renders a Select2 input
    box as its editor.
  */
  var Select2CellEditor = Backgrid.Select2CellEditor =
      Backgrid.SelectCellEditor.extend({
    /** @property */
    events: {
      "change": "onSave"
    },

    /** @property */
    setSelect2Options: function (options) {
      this.select2Options = _.extend(options || {});
    },

    /** @property */
    // This option will prevent Select2 list to pop up
    // when user press tab on select2
    select2Options: {
      openOnEnter: false
    },

    /** @property {function(Object, ?Object=): string} template */
    template: _.template([
      '<option value="<%- value %>" ',
      '<%= selected ? \'selected="selected"\' : "" %>>',
      '<%- text %></option>'].join(''),
      null,{
        variable: null
      }),

    initialize: function () {
      Backgrid.SelectCellEditor.prototype.initialize.apply(this, arguments);
      this.close = _.bind(this.close, this);
    },
    /**
       Renders a `select2` select box instead of the default `<select>` HTML
       element using the supplied options from #select2Options.
      */
    render: function () {
      var self =this,
          col = _.defaults(this.column.toJSON(), this.defaults),
          model = this.model, column = this.column,
          editable = Backgrid.callByNeed(col.editable, column, model),
          optionValues = Backgrid.callByNeed(col.options, column, this);

      this.$el.empty();

      if (!_.isArray(optionValues))
        throw new TypeError("optionValues must be an array");

      /*
       * Add empty option as Select2 requires any empty '<option><option>' for
       * some of its functionality to work.
       */

      var optionText = null,
          optionValue = null,
          model = this.model,
          selectedValues = model.get(this.column.get("name"));

      for (var i = 0; i < optionValues.length; i++) {
        var optionValue = optionValues[i];

        if (_.isArray(optionValue) || _.isObject(optionValue)) {
          optionText  = optionValue[0] || optionValue.label;
          optionValue = optionValue[1] || optionValue.value;

          this.$el.append(
            this.template({
              text: optionText,
              value: optionValue,
              selected: (selectedValues == optionValue) ||
                (_.indexOf(selectedValues, optionValue) > -1)
            }));
        } else {
          throw new TypeError(
            "optionValues elements must be a name-value pair."
          );
        }
      }
      // Initialize select2 control.
      this.$el.select2(
          _.defaults(
            {'disabled': !editable}, col.select2, this.select2Options
            ));

      setTimeout(function(){
        model.set(column.get("name"), self.$el.val());
      },10);

      this.delegateEvents();

      return this;
    },
    /**
       Attach event handlers to the select2 box and focus it.
    */
    postRender: function () {
      var self = this;
      self.$el.on("blur", function (e) {
        self.close(e);
      }).select2("focus");
    },

    remove: function () {
      this.$el.select2("destroy");
      return Backgrid.SelectCellEditor.prototype.remove.apply(this, arguments);
    },
    onSave: function (e) {
      var model = this.model;
      var column = this.column;
      model.set(column.get("name"), this.$el.val());
    }
  });

  /*
   *  Select2Cell for backgrid.
   */
  var Select2Cell = Backgrid.Extension.Select2Cell =
      Backgrid.SelectCell.extend({
    className: "select2-cell",
    /** @property */
    editor: Select2CellEditor,
    defaults: _.defaults({
        select2: {}
      }, Backgrid.SelectCell.prototype.defaults),
    events: {
      "change": "onSave",
      "select2:unselect": "onSave"
    },
    /** @property {function(Object, ?Object=): string} template */
    template: _.template([
      '<option value="<%- value %>" ',
      '<%= selected ? \'selected="selected"\' : "" %>>',
      '<%- text %></option>'].join(''),
      null,{
        variable: null
      }),

    render: function () {
      var col = _.defaults(this.column.toJSON(), this.defaults),
          model = this.model, column = this.column,
          editable = Backgrid.callByNeed(col.editable, column, model),
          optionValues = _.clone(this.optionValues || this.column.get('options'));

      this.$el.empty();

      if (!_.isArray(optionValues))
        throw new TypeError("optionValues must be an array");

      /*
       * Add empty option as Select2 requires any empty '<option><option>' for
       * some of its functionality to work.
       */
      optionValues.unshift([null, null]);

      var optionText = null,
          optionValue = null,
          model = this.model,
          selectedValues = model.get(this.column.get("name"));

      delete this.$select;

      this.$select = $("<select>", {tabIndex: -1}).appendTo(this.$el);

      for (var i = 0; i < optionValues.length; i++) {
        var optionValue = optionValues[i];

        if (_.isArray(optionValue)) {
          optionText  = optionValue[0];
          optionValue = optionValue[1];

          this.$select.append(
            this.template({
              text: optionText,
              value: optionValue,
              selected: (selectedValues == optionValue) ||
                (_.indexOf(selectedValues, optionValue) > -1)
            }));
        } else {
          throw new TypeError("optionValues elements must be a name-value pair.");
        }
      }
      // Initialize select2 control.
      this.$select.select2(
          _.defaults(
            {'disabled': !editable},
            col.select2,
            this.defaults.select2
            ));

      this.delegateEvents();

      return this;
    },

    /**
       Saves the value of the selected option to the model attribute.
    */
    onSave: function (e) {
      var model = this.model;
      var column = this.column;
      model.set(column.get("name"), this.$select.val());
    }
  });

  /**
    TextareaCellEditor the cell editor renders a textarea multi-line text input
    box as its editor.

    @class Backgrid.TextareaCellEditor
    @extends Backgrid.InputCellEditor
  */
  var TextareaCellEditor = Backgrid.TextareaCellEditor = Backgrid.InputCellEditor.extend({
    /** @property */
    tagName: "textarea",

    events: {
      "blur": "saveOrCancel",
      "keydown": ""
    }
  });

  /**
    TextareaCell displays multiline HTML strings.

      @class Backgrid.Extension.TextareaCell
      @extends Backgrid.Cell
  */
  var TextareaCell = Backgrid.Extension.TextareaCell = Backgrid.Cell.extend({
    /** @property */
    className: "textarea-cell",

    editor: TextareaCellEditor
  });

  return Backgrid;

}));
