import {
  Component,
  OnInit,
  ViewChildren,
  ElementRef,
  AfterViewInit,
  QueryList,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { first } from 'rxjs/operators';
import { KnowledgeBasesApolloService } from 'src/app/base/services/knowledge-bases/knowledge-bases-apollo.service';
import { NotificationService } from 'src/app/base/services/notification.service';
import { RouteService } from 'src/app/base/services/route.service';
import { DownloadState } from 'src/app/import/services/s3.enums';
import { timer } from 'rxjs';
import { UploadComponent } from 'src/app/import/components/upload/upload.component';
import { UserManager } from 'src/app/util/user-manager';
import { CommentDataManager, CommentType } from 'src/app/base/components/comment/comment-helper';
import { createDefaultLookupListDetailsModals, LookupListsDetailsModals } from './knowledge-bases-details-helper';
import { UploadFileType } from 'src/app/import/components/helpers/upload-types';
import { Project } from 'src/app/base/entities/project';
import { ProjectApolloService } from 'src/app/base/services/project/project-apollo.service';
import { toPythonFunctionName } from 'src/app/util/helper-functions';


@Component({
  selector: 'kern-knowledge-base-details',
  templateUrl: './knowledge-base-details.component.html',
  styleUrls: ['./knowledge-base-details.component.scss'],
})
export class KnowledgeBaseDetailsComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChildren('descriptionArea') descriptionArea: QueryList<ElementRef>;
  @ViewChildren('nameArea') nameArea: QueryList<ElementRef>;
  @ViewChild(UploadComponent) uploadComponent;
  file: File;

  projectId: string;
  knowledgeBase$: any;
  knowledgeBaseQuery$: any;
  knowledgeBaseId: any;
  terms$: any;
  termsQuery$: any;
  terms: any;
  nameOpen: boolean;
  knowledgeBaseName: string;
  descriptionOpen: boolean;
  knowledgeBaseDescription: string;
  termEditorOpen: boolean = false;
  editableTerm: string = '';
  termToAdd = '';
  commentToAdd = '';
  subscriptions$: Subscription[] = [];
  isHeaderNormal: boolean = true;
  downloadMessage: DownloadState = DownloadState.NONE;
  listSize: number = -1;
  get DownloadStateType(): typeof DownloadState {
    return DownloadState;
  }
  lookupListDetailsModals: LookupListsDetailsModals = createDefaultLookupListDetailsModals();
  project: Project;

  get UploadFileType(): typeof UploadFileType {
    return UploadFileType;
  }

  constructor(
    private routeService: RouteService,
    private activatedRoute: ActivatedRoute,
    private knowledgeBaseApolloService: KnowledgeBasesApolloService,
    private router: Router,
    private projectApolloService: ProjectApolloService
  ) { }
  ngOnDestroy(): void {
    this.subscriptions$.forEach(element => element.unsubscribe());
    NotificationService.unsubscribeFromNotification(this, this.projectId);
    CommentDataManager.unregisterAllCommentRequests(this);
  }

  ngOnInit(): void {
    UserManager.checkUserAndRedirect(this);
    this.routeService.updateActivatedRoute(this.activatedRoute);


    this.projectId = this.activatedRoute.parent.snapshot.paramMap.get('projectId');
    let projectQuery$, project$;
    [projectQuery$, project$] = this.projectApolloService.getProjectByIdQuery(this.projectId);
    this.subscriptions$.push(project$.subscribe((project) => this.project = project));

    this.knowledgeBaseId = this.activatedRoute.snapshot.paramMap.get('knowledgeBaseId');
    [this.knowledgeBaseQuery$, this.knowledgeBase$] = this.knowledgeBaseApolloService.getKnowledgeBaseByKnowledgeBaseId(this.projectId, this.knowledgeBaseId);
    [this.termsQuery$, this.terms$] = this.knowledgeBaseApolloService.getTermsByKnowledgeBaseId(this.projectId, this.knowledgeBaseId);
    this.subscriptions$.push(this.terms$.subscribe((terms) => {

      this.listSize = terms ? terms.length : -1;
      if (terms?.length > 100) {
        this.terms = terms.slice(0, 100);
      } else {
        this.terms = terms;
      }
      this.terms.sort((a, b) => a.value.localeCompare(b.value));

    }));
    NotificationService.subscribeToNotification(this, {
      projectId: this.projectId,
      whitelist: ['knowledge_base_updated', 'knowledge_base_deleted', 'knowledge_base_term_updated'],
      func: this.handleWebsocketNotification
    });
    this.knowledgeBase$.subscribe(val => {
      this.knowledgeBaseName = val.name;
      this.knowledgeBaseDescription = val.description;
    })
    this.setUpCommentRequests(this.projectId);
  }
  private setUpCommentRequests(projectId: string) {
    const requests = [];
    requests.push({ commentType: CommentType.KNOWLEDGE_BASE, projectId: projectId });
    CommentDataManager.registerCommentRequests(this, requests);
  }

  ngAfterViewInit() {
    this.descriptionArea.changes.subscribe(() => {
      this.setFocus(this.descriptionArea);
    });
    this.nameArea.changes.subscribe(() => {
      this.setFocus(this.nameArea);
    });
  }

  setFocus(focusArea) {
    if (focusArea.length > 0) {
      focusArea.first.nativeElement.focus();
    }
  }

  isTermUnique(termName: string): boolean {
    for (const t of this.terms) {
      if (t.value == termName) return false;
    }
    return true;
  }

  copyImportToClipboard(pythonVariable: string) {
    const statement = "from knowledge import " + pythonVariable;
    navigator.clipboard.writeText(statement);
  }

  addTermToKnowledgeBase() {
    if (!this.isTermUnique(this.termToAdd)) return;
    this.termToAdd = this.termToAdd.trim();
    this.commentToAdd = this.commentToAdd.trim();
    this.knowledgeBaseApolloService
      .addTermToKnowledgeBase(
        this.projectId,
        this.termToAdd,
        this.commentToAdd,
        this.knowledgeBaseId
      )
      .pipe(first()).subscribe();
    this.termToAdd = '';
    this.commentToAdd = '';
  }
  checkTermNameUniqe(termName: string, btn: HTMLButtonElement) {
    btn.disabled = !termName || !this.isTermUnique(termName);
  }

  toggleBlacklistTerm(termId: string) {
    this.knowledgeBaseApolloService
      .toggleBlacklistTerm(this.projectId, this.knowledgeBaseId, termId)
      .pipe(first()).subscribe();
  }

  deleteTerm(termId: string) {
    this.knowledgeBaseApolloService
      .deleteTerm(this.projectId, this.knowledgeBaseId, termId)
      .pipe(first()).subscribe();
  }

  openName(open: boolean, projectId) {
    this.nameOpen = open;
    if (!open) {
      this.saveKnowledgeBase(projectId);
    }
  }

  openDescription(open: boolean, projectId) {
    this.descriptionOpen = open;
    if (!open) {
      this.saveKnowledgeBase(projectId)
    }
  }

  changeKnowledgeBaseName(event) {
    this.knowledgeBaseName = event.target.value;
    this.isHeaderNormal = true;
  }

  changeKnowledgeBaseDescription(event) {
    this.knowledgeBaseDescription = event.target.value;
  }

  saveKnowledgeBase(projectId) {
    this.knowledgeBaseApolloService
      .updateKnowledgeBase(
        this.projectId,
        this.knowledgeBaseId,
        this.knowledgeBaseName,
        this.knowledgeBaseDescription
      ).pipe(first()).subscribe();
  }

  isNameOpen(): boolean {
    return this.nameOpen;
  }

  isDescriptionOpen(): boolean {
    return this.descriptionOpen;
  }

  openTermEditor(
    open: boolean,
    termId: string,
    value: string,
    comment: string
  ) {
    this.termEditorOpen = open;

    if (open) {
      this.editableTerm = termId;
    } else {
      this.knowledgeBaseApolloService
        .updateTerm(this.projectId, this.knowledgeBaseId, this.editableTerm, value, comment)
        .pipe(first()).subscribe();
    }
  }

  cancelTermEditor() {
    this.termEditorOpen = false;
    this.editableTerm = '';
  }

  isTermEditorOpen() {
    return this.termEditorOpen;
  }

  handleWebsocketNotification(msgParts) {
    if (msgParts[2] == this.knowledgeBaseId) {
      if (msgParts[1] == 'knowledge_base_updated') {
        this.knowledgeBaseQuery$.refetch();
      } else if (msgParts[1] == 'knowledge_base_deleted') {
        alert('Lookup list was deleted');
        this.router.navigate(["../"], { relativeTo: this.activatedRoute });
      } else if (msgParts[1] == 'knowledge_base_term_updated') {
        this.termsQuery$.refetch();
      }
    }
  }

  deleteKnowledgeBase() {
    this.knowledgeBaseApolloService
      .deleteKnowledgeBase(this.projectId, this.knowledgeBaseId)
      .pipe(first())
      .subscribe();
    this.router.navigate(["../"], { relativeTo: this.activatedRoute });
  }

  requestFileExport(projectId: string): void {
    this.downloadMessage = DownloadState.PREPARATION;

    this.knowledgeBaseApolloService.exportList(projectId, this.knowledgeBaseId).subscribe((e) => {
      this.downloadMessage = DownloadState.DOWNLOAD;
      const downloadContent = JSON.parse(e);
      this.download('lookup_list.json', downloadContent);
      const timerTime = Math.max(2000, e.length * 0.0001);
      timer(timerTime).subscribe(
        () => (this.downloadMessage = DownloadState.NONE)
      );
    });
  }

  private download(filename, text) {
    var element = document.createElement('a');

    element.setAttribute(
      'href',
      'data:text/plain;charset=utf-8,' + encodeURIComponent(text)
    );
    element.setAttribute('download', filename);

    element.style.display = 'none';
    document.body.appendChild(element);

    element.click();

    document.body.removeChild(element);
  }

  pasteLookupList() {
    const pasteValues = this.lookupListDetailsModals.pasteLookupList;
    this.knowledgeBaseApolloService.pasteTerm(this.projectId, this.knowledgeBaseId, pasteValues.inputArea, pasteValues.inputSplit, pasteValues.remove)
      .pipe(first()).subscribe(() => {
        this.lookupListDetailsModals.pasteLookupList.inputArea = '';
      });
  }

  removeLookupList() {
    const removeValues = this.lookupListDetailsModals.removeLookupList;
    this.knowledgeBaseApolloService.pasteTerm(this.projectId, this.knowledgeBaseId, removeValues.inputArea, removeValues.inputSplit, removeValues.remove)
      .pipe(first()).subscribe(() => {
        this.lookupListDetailsModals.removeLookupList.inputArea = '';
      });
  }

  executeOption(value: string, term: any) {
    switch (value) {
      case 'Edit term':
        this.openTermEditor(true, term.id, term.value, term.comment);
        break;
      case 'Remove term':
        this.deleteTerm(term.id);
        break;
      case 'Blacklist term':
      case 'Whitelist term':
        this.toggleBlacklistTerm(term.id);
        break;
    }
  }

  setInputSplit(value: string, isRemove: boolean) {
    if (isRemove) {
      this.lookupListDetailsModals.removeLookupList.inputSplit = value;
    } else {
      this.lookupListDetailsModals.pasteLookupList.inputSplit = value;
    }
  }

  setTextareaValue(value: string, isRemove: boolean) {
    if (isRemove) {
      this.lookupListDetailsModals.removeLookupList.inputArea = value;
    } else {
      this.lookupListDetailsModals.pasteLookupList.inputArea = value;
    }
  }

  closeModalAndRefetchList() {
    this.lookupListDetailsModals.uploadLookupList.open = false;
    this.knowledgeBaseQuery$.refetch();
    this.termsQuery$.refetch();
  }

  onScrollEvent(event: Event) {
    if (!(event.target instanceof HTMLElement)) return;
    if ((event.target as HTMLElement).scrollTop > 0) {
      this.isHeaderNormal = false;
    } else {
      this.isHeaderNormal = true;
    }
  }
}
